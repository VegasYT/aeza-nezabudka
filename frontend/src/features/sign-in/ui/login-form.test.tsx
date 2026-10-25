import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { getSession } from '@shared/auth';
import {
	apiErrorResponse,
	apiServer,
	handleExchangeChallenge,
	handleLogin,
	handleSubmitTotp,
	renderWithTheme,
	serveSignInFlow,
} from '@shared/lib/test-utils';

import { LoginForm } from './login-form';

function renderForm() {
	const onSignedIn = vi.fn();
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	renderWithTheme(
		<QueryClientProvider client={queryClient}>
			<LoginForm onSignedIn={onSignedIn} />
		</QueryClientProvider>
	);

	return { onSignedIn, user: userEvent.setup() };
}

async function submitPassword(
	user: ReturnType<typeof userEvent.setup>,
	email: string
) {
	await user.type(screen.getByLabelText('Email'), email);
	await user.type(screen.getByLabelText('Пароль'), 'secret');
	await user.click(screen.getByRole('button', { name: 'Войти' }));
}

async function submitCode(user: ReturnType<typeof userEvent.setup>) {
	await user.type(await screen.findByLabelText('Код из приложения'), '123456');
	await user.click(screen.getByRole('button', { name: 'Подтвердить' }));
}

describe('вход паролем', () => {
	it('без 2FA сразу открывает панель', async () => {
		const { email } = serveSignInFlow();
		const { onSignedIn, user } = renderForm();

		await submitPassword(user, email);

		await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
		expect(getSession()).toMatchObject({ token: 'token-new' });
	});

	it('пока вход идёт, кнопка недоступна', async () => {
		const { email } = serveSignInFlow();

		apiServer.use(
			handleLogin(async () => {
				await delay('infinite');

				return HttpResponse.json({ challenge: 'c', requirements: [] });
			})
		);

		const { user } = renderForm();

		await submitPassword(user, email);

		expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled();
	});
});

describe('код 2FA', () => {
	it('после верного кода открывает панель', async () => {
		const { email } = serveSignInFlow({ requirements: ['totp'] });
		const { onSignedIn, user } = renderForm();

		await submitPassword(user, email);
		await submitCode(user);

		await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
	});

	it('неверный код оставляет шаг кода с сообщением', async () => {
		const { email } = serveSignInFlow({ requirements: ['totp'] });

		apiServer.use(handleSubmitTotp(apiErrorResponse(400, 'invalid_code')));

		const { onSignedIn, user } = renderForm();

		await submitPassword(user, email);
		await submitCode(user);

		expect(await screen.findByText(/Неверный код/)).toBeInTheDocument();
		expect(screen.getByLabelText('Код из приложения')).toBeInTheDocument();
		expect(onSignedIn).not.toHaveBeenCalled();
	});

	it('устаревший вход возвращает к паролю с сохранённым email', async () => {
		const { email } = serveSignInFlow({ requirements: ['totp'] });

		apiServer.use(handleSubmitTotp(apiErrorResponse(400, 'invalid_challenge')));

		const { user } = renderForm();

		await submitPassword(user, email);
		await submitCode(user);

		expect(
			await screen.findByText(/Вход занял слишком много времени/)
		).toBeInTheDocument();
		expect(screen.getByLabelText('Email')).toHaveValue(email);
	});
});

describe('отказ во входе', () => {
	it('неверный пароль', async () => {
		const { email } = serveSignInFlow();

		apiServer.use(handleLogin(apiErrorResponse(400, 'invalid_credentials')));

		const { user } = renderForm();

		await submitPassword(user, email);

		expect(
			await screen.findByText('Неверный email или пароль.')
		).toBeInTheDocument();
		expect(screen.getByLabelText('Email')).toHaveValue(email);
	});

	it('аккаунта нет в белом списке', async () => {
		const { email } = serveSignInFlow();

		apiServer.use(
			handleExchangeChallenge(apiErrorResponse(403, 'not_a_member'))
		);

		const { user } = renderForm();

		await submitPassword(user, email);

		expect(
			await screen.findByText('Нет доступа к Незабудке')
		).toBeInTheDocument();
		expect(screen.getByText(/Доступ выдаёт администратор/)).toBeInTheDocument();
	});

	it('слишком много попыток: минуты ожидания и недоступная кнопка', async () => {
		const { email } = serveSignInFlow();

		apiServer.use(
			handleLogin(
				apiErrorResponse(429, 'too_many_attempts', { 'Retry-After': '401' })
			)
		);

		const { user } = renderForm();

		await submitPassword(user, email);

		expect(
			await screen.findByText(/Повторите через 7 мин\./)
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled();
	});

	it('вход Aéza недоступен', async () => {
		const { email } = serveSignInFlow();

		apiServer.use(handleLogin(apiErrorResponse(503, 'identity_unavailable')));

		const { user } = renderForm();

		await submitPassword(user, email);

		expect(
			await screen.findByText('Сервис входа Aéza не отвечает')
		).toBeInTheDocument();
	});

	it('аккаунт интеграции не входит и видит объяснение', async () => {
		const { email } = serveSignInFlow({ role: 'integration' });

		apiServer.use(
			handleExchangeChallenge(apiErrorResponse(403, 'integration_account'))
		);

		const { onSignedIn, user } = renderForm();

		await submitPassword(user, email);

		expect(
			await screen.findByText('Это аккаунт для интеграций')
		).toBeInTheDocument();
		expect(getSession()).toBeNull();
		expect(onSignedIn).not.toHaveBeenCalled();
	});
});
