import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { getSession } from '@shared/auth';
import {
	apiServer,
	handleLogout,
	serveNotificationsScreen,
	servePaymentsScreen,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';
import { COLOR_SCHEME_STORAGE_KEY } from '@shared/ui/theme';

import { renderApp } from '../test-router';

beforeEach(() => {
	signIn();
	servePaymentsScreen();
	serveNotificationsScreen();
});

const sectionNames = [
	'Платежи',
	'Уведомления',
	'Регулярные платежи',
	'Отделы',
	'Пользователи',
	'Журнал',
];

it('в шапке видны логотип Aéza и название «Незабудка»', async () => {
	stubMatchMedia({ width: 1440 });

	renderApp('/notifications');

	const header = await screen.findByRole('banner');

	expect(within(header).getByRole('img', { name: 'Aéza' })).toBeInTheDocument();
	expect(within(header).getByText('Незабудка')).toBeInTheDocument();
	expect(within(header).getByRole('link', { name: 'Aéza' })).toHaveAttribute(
		'href',
		'https://aeza.ru'
	);
});

describe('навигация по ширине окна', () => {
	it('на широком экране пять разделов с подписями по порядку', async () => {
		stubMatchMedia({ width: 1440 });

		renderApp('/payments');

		const nav = await screen.findByRole('navigation', { name: 'Разделы' });

		expect(
			within(nav)
				.getAllByRole('link')
				.map((link) => link.textContent)
		).toEqual(sectionNames);
	});

	it('на узком экране разделы показаны значками, фокус открывает подсказку', async () => {
		stubMatchMedia({ width: 1024 });

		renderApp('/payments');

		const nav = await screen.findByRole('navigation', { name: 'Разделы' });
		const links = within(nav).getAllByRole('link');

		expect(links.map((link) => link.getAttribute('aria-label'))).toEqual(
			sectionNames
		);
		expect(links.every((link) => link.textContent === '')).toBe(true);

		act(() => {
			within(nav).getByRole('link', { name: 'Регулярные платежи' }).focus();
		});

		expect(await screen.findByRole('tooltip')).toHaveTextContent(
			'Регулярные платежи'
		);
	});

	it('на телефоне разделы в нижней панели только значками', async () => {
		stubMatchMedia({ width: 390 });

		renderApp('/payments');

		const header = await screen.findByRole('banner');

		expect(within(header).queryByRole('navigation')).not.toBeInTheDocument();

		const links = within(
			screen.getByRole('navigation', { name: 'Разделы' })
		).getAllByRole('link');

		expect(links.map((link) => link.getAttribute('aria-label'))).toEqual(
			sectionNames
		);
		expect(links.every((link) => link.textContent === '')).toBe(true);
	});
});

describe('переключатель схемы', () => {
	it('без выбора схема из системы, «Тёмная тема» в меню аккаунта переключает и запоминает', async () => {
		stubMatchMedia({ width: 1440, colorScheme: 'dark' });

		const user = userEvent.setup();

		renderApp('/payments');

		const header = await screen.findByRole('banner');

		expect(within(header).queryByRole('switch')).not.toBeInTheDocument();

		await user.click(within(header).getByRole('button', { name: /^Аккаунт/ }));

		const toggle = await screen.findByRole('switch', { name: 'Тёмная тема' });

		expect(toggle).toBeChecked();

		await user.click(toggle);

		expect(document.documentElement).toHaveAttribute(
			'data-mantine-color-scheme',
			'light'
		);
		expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('light');
		expect(
			screen.getByRole('switch', { name: 'Тёмная тема' })
		).not.toBeChecked();
		expect(screen.getByRole('menuitem', { name: 'Выйти' })).toBeVisible();
	});

	it('на телефоне в шапке нет переключателя, он в меню аккаунта', async () => {
		stubMatchMedia({ width: 390 });

		const user = userEvent.setup();

		renderApp('/payments');

		const header = await screen.findByRole('banner');

		expect(within(header).queryByRole('switch')).not.toBeInTheDocument();
		expect(within(header).queryByRole('radio')).not.toBeInTheDocument();

		await user.click(within(header).getByRole('button', { name: /^Аккаунт/ }));

		expect(
			await screen.findByRole('switch', { name: 'Тёмная тема' })
		).toBeInTheDocument();
	});
});

describe('разделы по роли', () => {
	it('пользователю видны только Платежи и Уведомления', async () => {
		signIn('user');
		stubMatchMedia({ width: 1440 });

		renderApp('/payments');

		const nav = await screen.findByRole('navigation', { name: 'Разделы' });

		expect(
			within(nav)
				.getAllByRole('link')
				.map((link) => link.textContent)
		).toEqual(['Платежи', 'Уведомления']);
	});

	it('на телефоне у пользователя в нижней панели тоже два раздела', async () => {
		signIn('user');
		stubMatchMedia({ width: 390 });

		renderApp('/payments');

		const nav = await screen.findByRole('navigation', { name: 'Разделы' });

		expect(
			within(nav)
				.getAllByRole('link')
				.map((link) => link.getAttribute('aria-label'))
		).toEqual(['Платежи', 'Уведомления']);
	});

	it('раздел администратора у пользователя показывает «Нет доступа» и ведёт к платежам', async () => {
		signIn('user');
		stubMatchMedia({ width: 1440 });

		const user = userEvent.setup();

		renderApp('/departments');

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Нет доступа' })
		).toBeInTheDocument();
		expect(
			screen.getByText(/Раздел «Отделы» доступен только/)
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
});

describe('аккаунт в шапке', () => {
	it('меню показывает email, роль и «Выйти»', async () => {
		const { email } = signIn('user');

		stubMatchMedia({ width: 1440 });

		const user = userEvent.setup();

		renderApp('/payments');
		await user.click(
			await screen.findByRole('button', { name: `Аккаунт ${email}` })
		);

		const menu = await screen.findByRole('menu');

		expect(within(menu).getByText(email)).toBeInTheDocument();
		expect(within(menu).getByText('Пользователь')).toBeInTheDocument();
		expect(
			within(menu).getByRole('menuitem', { name: 'Выйти' })
		).toBeInTheDocument();
	});

	it('«Выйти» завершает сессию на сервере и открывает вход', async () => {
		const { email } = signIn('user');
		const logoutTokens: (string | null)[] = [];

		apiServer.use(
			handleLogout(({ request }) => {
				logoutTokens.push(request.headers.get('Authorization'));

				return new HttpResponse(null, { status: 204 });
			})
		);
		stubMatchMedia({ width: 1440 });

		const user = userEvent.setup();

		renderApp('/payments');
		await user.click(
			await screen.findByRole('button', { name: `Аккаунт ${email}` })
		);
		await user.click(await screen.findByRole('menuitem', { name: 'Выйти' }));

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Вход' })
		).toBeInTheDocument();
		expect(logoutTokens).toEqual(['Bearer token-user']);
		expect(getSession()).toBeNull();
	});

	it('при ошибке запроса выхода всё равно открывается вход', async () => {
		const { email } = signIn('user');

		apiServer.use(handleLogout(() => new HttpResponse(null, { status: 500 })));
		stubMatchMedia({ width: 1440 });

		const user = userEvent.setup();

		renderApp('/payments');
		await user.click(
			await screen.findByRole('button', { name: `Аккаунт ${email}` })
		);
		await user.click(await screen.findByRole('menuitem', { name: 'Выйти' }));

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Вход' })
		).toBeInTheDocument();
	});
});
