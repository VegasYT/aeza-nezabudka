import { createStore, useStore } from 'zustand';

import { getCurrentUser, streamEvents } from '@shared/api';

/** Изменение из потока событий: `type` - код действия, как в журнале, или `telegram.changed`. */
export interface LiveChange {
	type: string;
	entityType: string | null;
	entityId: string | null;
	entityName: string | null;
	actorLogin: string | null;
}

interface LiveHandlers {
	onChange: (change: LiveChange) => void;
	/** Поток открылся заново или сервер потерял события: данные на экране могли устареть. */
	onResync: () => void;
}

const liveStore = createStore<{ connected: boolean }>()(() => ({
	connected: false,
}));

/** Открыт ли поток событий: пока его нет, экран, который ждёт изменения, сам опрашивает сервер. */
export function useLiveConnected() {
	return useStore(liveStore, (state) => state.connected);
}

const DEFAULT_RETRY = 3000;
const MAX_RETRY = 30_000;

function wait(ms: number, signal: AbortSignal) {
	return new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);

		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});
}

function toChange(data: unknown): LiveChange | null {
	if (typeof data !== 'object' || data === null) {
		return null;
	}

	const fields = data as Record<string, unknown>;
	const text = (key: string) =>
		typeof fields[key] === 'string' ? fields[key] : null;
	const type = text('type');

	return type
		? {
				type,
				entityType: text('entityType'),
				entityId: text('entityId'),
				entityName: text('entityName'),
				actorLogin: text('actorLogin'),
			}
		: null;
}

async function run({ onChange, onResync }: LiveHandlers, signal: AbortSignal) {
	let opened = false;
	let failures = 0;
	let retry = DEFAULT_RETRY;

	while (!signal.aborted) {
		let ready = false;
		let failed = false;
		const { stream } = await streamEvents({
			signal,
			// Повторы ведёт этот цикл: свой цикл клиента не переподключается после закрытия сервером.
			sseMaxRetryAttempts: 1,
			// Поток читает fetch, а не axios: вне браузера (тесты) запросу нужен полный адрес.
			baseURL: window.location.origin,
			onSseError: () => {
				failed = true;
			},
			onSseEvent: (event) => {
				retry = event.retry ?? retry;

				if (event.event === 'ready') {
					ready = true;
					failures = 0;
					liveStore.setState({ connected: true });

					if (opened) {
						onResync();
					}

					opened = true;
				} else if (event.event === 'resync') {
					onResync();
				} else if (event.event === 'change') {
					const change = toChange(event.data);

					if (change) {
						onChange(change);
					}
				}
			},
		});

		// События разбирает onSseEvent: в итератор приходят только данные без имени события,
		// он нужен, чтобы читать поток до конца.
		while (!(await stream.next()).done) {
			continue;
		}

		if (ready) {
			liveStore.setState({ connected: false });
		}

		if (signal.aborted) {
			return;
		}

		if (failed && !ready) {
			// Статус ответа потока клиент не отдаёт. Обычный запрос на 401 сам откроет повторный вход
			// и дождётся его; после выхода он вернёт ошибку, а цикл остановит отмена.
			await getCurrentUser({ signal });
		}

		if (failed) {
			failures += 1;
			await wait(Math.min(retry * 2 ** (failures - 1), MAX_RETRY), signal);
		} else {
			await wait(retry, signal);
		}
	}
}

/** Держит поток событий `GET /events`, пока не вызвана возвращённая функция; переподключается сам. */
export function connectLiveEvents(handlers: LiveHandlers) {
	const controller = new AbortController();

	void run(handlers, controller.signal);

	return () => controller.abort();
}
