import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
	serveNotificationsScreen,
	servePaymentsScreen,
	serveRecurringScreen,
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

async function signInThroughForm(user: ReturnType<typeof userEvent.setup>) {
	await user.type(
		await screen.findByLabelText('Email'),
		'a.smirnov@company.ru'
	);
	await user.type(screen.getByLabelText('Пароль'), 'secret');
	await user.click(screen.getByRole('button', { name: 'Войти' }));
}

describe('вход нужен для любого раздела', () => {
	it('раздел без входа показывает вход, а после входа открывается', async () => {
		serveSignInFlow({ role: 'admin' });

		const user = userEvent.setup();
		const { router } = renderApp('/notifications');

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Вход' })
		).toBeInTheDocument();

		await signInThroughForm(user);

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Уведомления' })
		).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/notifications');
	});

	it('после входа с главной открываются Платежи', async () => {
		serveSignInFlow({ role: 'admin' });

		const user = userEvent.setup();
		const { router } = renderApp('/');

		await signInThroughForm(user);

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Платежи' })
		).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/payments');
	});

	it('страница входа с действующей сессией ведёт на Платежи', async () => {
		signIn();

		const { router } = renderApp('/login');

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Платежи' })
		).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/payments');
	});

	it('на странице входа кнопка «Тёмная тема» переключает схему', async () => {
		stubMatchMedia({ colorScheme: 'light' });

		const user = userEvent.setup();

		renderApp('/login');

		const toggle = await screen.findByRole('switch', { name: 'Тёмная тема' });

		expect(toggle).not.toBeChecked();

		await user.click(toggle);

		expect(document.documentElement).toHaveAttribute(
			'data-mantine-color-scheme',
			'dark'
		);
		expect(toggle).toBeChecked();
	});
});

it('корневой адрес открывает Платежи', async () => {
	signIn();

	const { router } = renderApp('/');

	expect(
		await screen.findByRole('heading', { level: 1, name: 'Платежи' })
	).toBeInTheDocument();
	expect(router.state.location.pathname).toBe('/payments');
});

it('выбор раздела в навигации открывает его страницу и отмечает его текущим', async () => {
	signIn();

	const user = userEvent.setup();

	renderApp('/payments');

	const nav = await screen.findByRole('navigation', { name: 'Разделы' });

	await user.click(within(nav).getByRole('link', { name: 'Отделы' }));

	expect(
		await screen.findByRole('heading', { level: 1, name: 'Отделы' })
	).toBeInTheDocument();
	expect(within(nav).getByRole('link', { name: 'Отделы' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	expect(
		within(nav).getByRole('link', { name: 'Платежи' })
	).not.toHaveAttribute('aria-current');
});

it('прямой адрес открывает раздел и отмечает его в навигации', async () => {
	signIn();
	serveRecurringScreen();

	renderApp('/recurring-payments');

	expect(
		await screen.findByRole('heading', {
			level: 1,
			name: 'Регулярные платежи',
		})
	).toBeInTheDocument();
	expect(
		screen.getByRole('link', { name: 'Регулярные платежи' })
	).toHaveAttribute('aria-current', 'page');
});

it('неизвестный адрес показывает «Страница не найдена» в каркасе и ведёт к платежам', async () => {
	signIn();

	const user = userEvent.setup();

	renderApp('/payment');

	expect(
		await screen.findByRole('heading', {
			level: 1,
			name: 'Страница не найдена',
		})
	).toBeInTheDocument();

	const nav = screen.getByRole('navigation', { name: 'Разделы' });

	expect(
		within(nav).queryByRole('link', { current: 'page' })
	).not.toBeInTheDocument();

	await user.click(screen.getByRole('link', { name: 'Перейти к платежам' }));

	expect(
		await screen.findByRole('heading', { level: 1, name: 'Платежи' })
	).toBeInTheDocument();
});
