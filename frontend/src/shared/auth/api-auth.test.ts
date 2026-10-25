import { describe, expect, it, vi } from 'vitest';

import { getCurrentUser } from '@shared/api';
import {
	accountEmail,
	hoursFromNow,
	serveCurrentUserForToken,
} from '@shared/lib/test-utils';

import { SessionEndedError } from './reauth';
import { clearSession, sessionStore, setSession } from './session';

function startWithStaleSession() {
	setSession({
		token: 'stale',
		expiresAt: hoursFromNow(1),
		email: accountEmail('user'),
	});
}

describe('повторный вход при 401', () => {
	it('один повторный вход на все упавшие запросы, затем они повторяются с новым токеном', async () => {
		const tokens = serveCurrentUserForToken('fresh');

		startWithStaleSession();

		const first = getCurrentUser({ throwOnError: true });
		const second = getCurrentUser({ throwOnError: true });

		await vi.waitFor(() =>
			expect(sessionStore.getState().reauthOpen).toBe(true)
		);
		await vi.waitFor(() => expect(tokens).toHaveLength(2));

		setSession({
			token: 'fresh',
			expiresAt: hoursFromNow(1),
			email: accountEmail('user'),
		});

		await expect(first).resolves.toMatchObject({ data: { role: 'user' } });
		await expect(second).resolves.toMatchObject({ data: { role: 'user' } });
		expect(tokens.slice(2)).toEqual(['Bearer fresh', 'Bearer fresh']);
		expect(sessionStore.getState().reauthOpen).toBe(false);
	});

	it('повторённый запрос с новым 401 не открывает окно снова', async () => {
		serveCurrentUserForToken('never');
		startWithStaleSession();

		const request = getCurrentUser({ throwOnError: true });

		await vi.waitFor(() =>
			expect(sessionStore.getState().reauthOpen).toBe(true)
		);
		setSession({
			token: 'fresh',
			expiresAt: hoursFromNow(1),
			email: accountEmail('user'),
		});

		await expect(request).rejects.toMatchObject({ response: { status: 401 } });
		expect(sessionStore.getState().reauthOpen).toBe(false);
	});

	it('выход вместо входа отменяет упавшие запросы', async () => {
		serveCurrentUserForToken('fresh');
		startWithStaleSession();

		const first = getCurrentUser({ throwOnError: true });
		const second = getCurrentUser({ throwOnError: true });

		await vi.waitFor(() =>
			expect(sessionStore.getState().reauthOpen).toBe(true)
		);
		clearSession();

		await expect(first).rejects.toBeInstanceOf(SessionEndedError);
		await expect(second).rejects.toBeInstanceOf(SessionEndedError);
	});
});
