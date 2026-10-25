import { describe, expect, it } from 'vitest';

import {
	clearSession,
	createSessionStore,
	SESSION_STORAGE_KEY,
	setSession,
} from './session';

const session = {
	token: 'token-1',
	expiresAt: '2026-10-25T02:00:00Z',
	email: 'buh.petrova@company.ru',
};

describe('сессия вкладки', () => {
	it('переживает обновление страницы', () => {
		setSession(session);

		// Новое хранилище читает sessionStorage так же, как после перезагрузки вкладки.
		const reloaded = createSessionStore(() => window.sessionStorage);

		expect(reloaded.getState().session).toEqual(session);
	});

	it('после выхода токена нет в sessionStorage', () => {
		setSession(session);
		clearSession();

		expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toContain(
			session.token
		);
		expect(
			createSessionStore(() => window.sessionStorage).getState().session
		).toBeNull();
	});
});
