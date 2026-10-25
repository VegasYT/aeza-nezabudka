import { HttpResponse } from 'msw';

import { handleStreamEvents } from '@shared/api/generated/msw.gen';
import type { LiveChange } from '@shared/live';

import { apiServer } from './api-server';

const encoder = new TextEncoder();

/**
 * Поток `GET /events`: при каждом подключении `ready`, дальше события из `change` и `resync`;
 * поток открыт, пока панель не отменит запрос. `connections` - сколько раз панель подключалась.
 */
export function serveLiveEvents() {
	const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
	const live = {
		connections: 0,
		/** Отправить всем открытым потокам событие `change`. */
		change: (change: Partial<LiveChange> & Pick<LiveChange, 'type'>) =>
			send('change', {
				entityType: null,
				entityId: null,
				entityName: null,
				actorLogin: null,
				...change,
			}),
		resync: () => send('resync', {}),
		/** Закрыть потоки со стороны сервера, как раз в 10 минут. */
		close: () => {
			for (const stream of streams) {
				stream.close();
			}

			streams.clear();
		},
	};

	function send(event: string, data: object) {
		const chunk = encoder.encode(
			`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
		);

		for (const stream of streams) {
			stream.enqueue(chunk);
		}
	}

	apiServer.use(
		handleStreamEvents(({ request }) => {
			let controller: ReadableStreamDefaultController<Uint8Array>;
			const body = new ReadableStream<Uint8Array>({
				start: (started) => {
					controller = started;
					streams.add(started);
					started.enqueue(
						encoder.encode('event: ready\ndata: {}\nretry: 10\n\n')
					);
				},
				cancel: () => {
					streams.delete(controller);
				},
			});

			live.connections += 1;
			request.signal.addEventListener('abort', () =>
				streams.delete(controller)
			);

			return new HttpResponse(body, {
				headers: { 'Content-Type': 'text/event-stream' },
			});
		})
	);

	return live;
}
