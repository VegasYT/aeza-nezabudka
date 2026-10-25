import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { getSession, setSession } from '@shared/auth';
import {
	hoursFromNow,
	serveCurrentUserForToken,
	serveNotificationsScreen,
	servePaymentsScreen,
	serveSignInFlow,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';

import { renderApp } from './test-router';

beforeEach(() => {
	stubMatchMedia({ width: 1440 });
	servePaymentsScreen();
	serveNotificationsScreen();
});

// Сессия `token-user` на сервере уже закончилась: `GET /auth/me` принимает только новый токен входа.
function expireSessionOnServer() {
	serveSignInFlow();

	return serveCurrentUserForToken('token-new');
}

async function signInAgain(
	user: ReturnType<typeof userEvent.setup>,
	email: string
) {
	const dialog = await screen.findByRole('dialog', {
		name: 'Сессия закончилась',
	});

	expect(within(dialog).getByLabelText('Аккаунт Aéza')).toHaveValue(email);
	await user.type(within(dialog).getByLabelText('Пароль'), 'secret');
	await user.click(within(dialog).getByRole('button', { name: 'Войти' }));
}

describe('повторный вход', () => {
	it('запрос с истёкшей сессией выполняется после входа в окне', async () => {
		const { email } = signIn('user');
		const meTokens = expireSessionOnServer();
		const user = userEvent.setup();

		renderApp('/payments');
		await signInAgain(user, email);

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Платежи' })
		).toBeInTheDocument();
		expect(meTokens.at(-1)).toBe('Bearer token-new');
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('переход после окончания срока ждёт входа и открывает раздел', async () => {
		const { email } = signIn('user');
		const user = userEvent.setup();

		renderApp('/payments');

		const nav = await screen.findByRole('navigation', { name: 'Разделы' });

		expireSessionOnServer();
		setSession({ token: 'token-user', expiresAt: hoursFromNow(-1), email });
		await user.click(within(nav).getByRole('link', { name: 'Уведомления' }));
		await signInAgain(user, email);

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Уведомления' })
		).toBeInTheDocument();
	});

	it('«Войти другим аккаунтом» ведёт на вход и не повторяет прерванный запрос', async () => {
		signIn('user');

		const meTokens = expireSessionOnServer();
		const user = userEvent.setup();

		renderApp('/payments');

		const dialog = await screen.findByRole('dialog', {
			name: 'Сессия закончилась',
		});

		await user.click(
			within(dialog).getByRole('button', { name: 'Войти другим аккаунтом' })
		);

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Вход' })
		).toBeInTheDocument();
		expect(getSession()).toBeNull();
		expect(meTokens).toEqual(['Bearer token-user']);
	});

	it('Escape не закрывает окно повторного входа', async () => {
		signIn('user');
		expireSessionOnServer();

		const user = userEvent.setup();

		renderApp('/payments');
		await screen.findByRole('dialog', { name: 'Сессия закончилась' });
		await user.keyboard('{Escape}');

		expect(
			screen.getByRole('dialog', { name: 'Сессия закончилась' })
		).toBeInTheDocument();
	});
});
