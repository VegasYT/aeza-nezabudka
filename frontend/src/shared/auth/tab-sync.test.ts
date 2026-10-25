import { describe, expect, it, vi } from 'vitest';

import { createSessionStore } from './session';
import {
	requestSessionFromTabs,
	syncSessionWithTabs,
	type TabChannel,
	type TabMessage,
} from './tab-sync';

// Канал вкладок одной панели: сообщение доходит до всех вкладок, кроме отправителя, асинхронно.
function createTabs() {
	const channels: TabChannel[] = [];

	return () => {
		const channel: TabChannel = {
			onmessage: null,
			postMessage(message: TabMessage) {
				for (const other of channels) {
					if (other !== channel) {
						queueMicrotask(() =>
							other.onmessage?.(new MessageEvent('message', { data: message }))
						);
					}
				}
			},
		};

		channels.push(channel);

		return channel;
	};
}

const session = {
	token: 'token-1',
	expiresAt: '2026-10-25T02:00:00Z',
	email: 'buh.petrova@company.ru',
};

// Своя вкладка - своё хранилище: как отдельный sessionStorage у каждой вкладки браузера.
function openTab(connect: () => TabChannel) {
	const items = new Map<string, string>();
	const store = createSessionStore(() => ({
		getItem: (name) => items.get(name) ?? null,
		setItem: (name, value) => void items.set(name, value),
		removeItem: (name) => void items.delete(name),
	}));
	const channel = connect();

	syncSessionWithTabs(store, channel);

	return { store, channel };
}

describe('сессия во вкладках', () => {
	it('новая вкладка получает токен от открытой', async () => {
		const connect = createTabs();
		const first = openTab(connect);

		first.store.setState({ session });

		const second = openTab(connect);

		await requestSessionFromTabs(second.store, second.channel);

		expect(second.store.getState().session).toEqual(session);
	});

	it('выход в одной вкладке завершает сессию в другой', async () => {
		const connect = createTabs();
		const first = openTab(connect);
		const second = openTab(connect);

		first.store.setState({ session });
		await vi.waitFor(() =>
			expect(second.store.getState().session).toEqual(session)
		);

		first.store.setState({ session: null });

		await vi.waitFor(() => expect(second.store.getState().session).toBeNull());
	});

	it('без открытых вкладок ждёт ответа не дольше 150 мс', async () => {
		vi.useFakeTimers();

		const tab = openTab(createTabs());
		const ready = requestSessionFromTabs(tab.store, tab.channel);

		await vi.advanceTimersByTimeAsync(150);
		await ready;

		expect(tab.store.getState().session).toBeNull();
	});
});
