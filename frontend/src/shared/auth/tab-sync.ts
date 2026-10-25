import { type Session, type SessionStore, sessionStore } from './session';

/** Сообщение между вкладками панели. */
export type TabMessage =
	| { type: 'request' }
	| { type: 'session'; session: Session }
	| { type: 'logout' };

/** Канал между вкладками: `BroadcastChannel` в браузере, подмена в тестах. */
export interface TabChannel {
	postMessage(message: TabMessage): void;
	onmessage: ((event: MessageEvent<TabMessage>) => void) | null;
}

function sameSession(a: Session | null, b: Session | null) {
	return (
		a?.token === b?.token &&
		a?.expiresAt === b?.expiresAt &&
		a?.email === b?.email
	);
}

/** Связывает сессию вкладки с другими вкладками: отвечает им токеном и принимает их вход и выход. */
export function syncSessionWithTabs(store: SessionStore, channel: TabChannel) {
	let applyingRemote = false;

	// Ответы на запрос новой вкладки получают все вкладки: одинаковую сессию повторно не ставим.
	const applyRemote = (session: Session | null) => {
		if (sameSession(store.getState().session, session)) {
			return;
		}

		applyingRemote = true;
		store.setState({ session });
		applyingRemote = false;
	};

	channel.onmessage = ({ data }) => {
		switch (data.type) {
			case 'request': {
				const { session } = store.getState();

				if (session) {
					channel.postMessage({ type: 'session', session });
				}

				break;
			}

			case 'session':
				applyRemote(data.session);
				break;

			case 'logout':
				applyRemote(null);
				break;
		}
	};

	store.subscribe((state, previous) => {
		if (applyingRemote || state.session === previous.session) {
			return;
		}

		channel.postMessage(
			state.session
				? { type: 'session', session: state.session }
				: { type: 'logout' }
		);
	});
}

/** Просит токен у открытых вкладок, если у этой его нет; ждёт ответа не дольше 150 мс. */
export function requestSessionFromTabs(
	store: SessionStore,
	channel: TabChannel
) {
	return new Promise<void>((resolve) => {
		if (store.getState().session) {
			resolve();

			return;
		}

		const finish = () => {
			clearTimeout(timer);
			unsubscribe();
			resolve();
		};
		const timer = setTimeout(finish, 150);
		const unsubscribe = store.subscribe((state) => {
			if (state.session) {
				finish();
			}
		});

		channel.postMessage({ type: 'request' });
	});
}

let tabsReady = Promise.resolve();

/** Подключает вкладку к общей сессии панели; ответ других вкладок ждут маршруты через `whenTabsReady`. */
export function connectTabs() {
	if (typeof BroadcastChannel === 'undefined') {
		return;
	}

	const channel = new BroadcastChannel('nezabudka-session');

	syncSessionWithTabs(sessionStore, channel);
	tabsReady = requestSessionFromTabs(sessionStore, channel);
}

/** Ждёт ответа открытых вкладок с токеном (не дольше 150 мс после старта); без подключения - сразу. */
export function whenTabsReady() {
	return tabsReady;
}
