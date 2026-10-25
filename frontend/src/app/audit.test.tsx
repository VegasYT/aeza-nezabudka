import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry, User } from '@shared/api';
import {
	apiErrorBody,
	apiServer,
	handleListAuditLog,
	handleListDepartments,
	handleListUsers,
	serveLiveEvents,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';

import { renderApp } from './test-router';

// Сейчас в браузере 25.10.2026 12:00; записи заданы местным временем.
const local = (month: number, day: number, hours: number, minutes: number) =>
	new Date(2026, month - 1, day, hours, minutes).toISOString();

function entry(overrides: Partial<AuditEntry>): AuditEntry {
	return {
		id: `e-${Math.random()}`,
		at: local(10, 25, 10, 38),
		actorLogin: 'a.smirnov@company.ru',
		action: 'auth.login',
		entity: 'member',
		entityId: 'id-admin',
		entityName: 'a.smirnov@company.ru',
		details: {},
		...overrides,
	};
}

const login = entry({ id: 'e-login' });
const paid = entry({
	id: 'e-paid',
	at: local(10, 22, 11, 14),
	actorLogin: 'buh.petrova@company.ru',
	action: 'occurrence.paid',
	entity: 'occurrence',
	entityName: 'Интернет в офисе',
	details: {
		dueDate: '2026-10-20',
		paidOnBefore: null,
		paidOn: '2026-10-22',
	},
});

const member = (email: string): User => ({
	id: `id-${email}`,
	email,
	role: 'user',
	enabled: true,
	editable: true,
	linked: true,
	createdAt: '2026-09-01T06:00:00Z',
	lastLoginAt: null,
	lastSeenAt: null,
});

/** Журнал на «сервере»: отдаёт записи страницами по `limit` и `offset`, запоминает параметры. */
function serveAudit(entries: AuditEntry[]) {
	const requests: URLSearchParams[] = [];

	apiServer.use(
		handleListAuditLog(({ request }) => {
			const params = new URL(request.url).searchParams;
			const offset = Number(params.get('offset') ?? 0);
			const limit = Number(params.get('limit') ?? 50);

			requests.push(params);

			return HttpResponse.json({
				items: entries.slice(offset, offset + limit),
				total: entries.length,
			});
		}),
		handleListUsers({
			body: {
				items: [
					member('a.smirnov@company.ru'),
					member('buh.petrova@company.ru'),
				],
				total: 2,
			},
		}),
		handleListDepartments({ body: { items: [], total: 0 } })
	);

	return requests;
}

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	vi.setSystemTime(new Date(2026, 9, 25, 12, 0));
	stubMatchMedia({ width: 1440 });
});

function setupUser() {
	return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

it('пользователь по адресу видит «Нет доступа», журнал не запрашивается', async () => {
	const requests = serveAudit([login]);

	signIn('user');
	renderApp('/audit');

	expect(
		await screen.findByRole('heading', { name: 'Нет доступа' })
	).toBeInTheDocument();
	expect(requests).toHaveLength(0);
});

describe('журнал администратора', () => {
	beforeEach(() => {
		signIn('admin');
	});

	it('записи по дням, число записей и запрос по умолчанию за 30 дней', async () => {
		const requests = serveAudit([login, paid]);

		renderApp('/audit');

		expect(
			await screen.findByRole('columnheader', { name: 'Сегодня, 25.10.2026' })
		).toBeInTheDocument();
		expect(
			screen.getByRole('columnheader', { name: '22.10.2026' })
		).toBeInTheDocument();
		expect(screen.getByText('2 записи')).toBeInTheDocument();

		const row = screen.getByRole('row', { name: /Отметка оплаты/ });

		expect(row).toHaveTextContent('11:14');
		expect(row).toHaveTextContent('buh.petrova@company.ru');
		expect(row).toHaveTextContent('Интернет в офисе');
		expect(row).toHaveTextContent('срок 20.10.2026');
		expect(row).toHaveTextContent('Дата оплаты 22.10.2026');
		expect(screen.getByRole('row', { name: /Вход/ })).toHaveTextContent(
			'10:38'
		);

		const [params] = requests;

		expect(params?.get('limit')).toBe('50');
		expect(params?.get('from')).toBe(new Date(2026, 8, 26).toISOString());
		expect(params?.get('to')).toBe(
			new Date(new Date(2026, 9, 26).getTime() - 1).toISOString()
		);
		expect(params?.has('action')).toBe(false);
		expect(params?.has('actorLogin')).toBe(false);
	});

	it('новая запись из потока событий появляется сверху без обновления страницы', async () => {
		const entries = [login];

		serveAudit(entries);

		const live = serveLiveEvents();

		renderApp('/audit');

		expect(await screen.findByText('1 запись')).toBeInTheDocument();
		await waitFor(() => expect(live.connections).toBe(1));

		entries.unshift({ ...paid, at: local(10, 25, 11, 50) });
		live.change({
			type: 'occurrence.paid',
			entityType: 'occurrence',
			entityName: 'Интернет в офисе',
			actorLogin: 'buh.petrova@company.ru',
		});

		expect(await screen.findByText('2 записи')).toBeInTheDocument();
		expect(screen.getAllByRole('row')[2]).toHaveTextContent('Отметка оплаты');
	});

	it('фильтр «Оплаты» уходит в запрос и в адрес', async () => {
		const requests = serveAudit([login, paid]);
		const user = setupUser();
		const { router } = renderApp('/audit');

		await user.click(await screen.findByRole('combobox', { name: 'Действие' }));
		await user.click(screen.getByRole('option', { name: 'Оплаты' }));

		await waitFor(() =>
			expect(requests.at(-1)?.get('action')).toBe('occurrence.*')
		);
		expect(router.state.location.search).toEqual({ action: 'occurrences' });
	});

	it('фильтр «Напоминания» уходит в запрос и в адрес', async () => {
		const requests = serveAudit([login, paid]);
		const user = setupUser();
		const { router } = renderApp('/audit');

		await user.click(await screen.findByRole('combobox', { name: 'Действие' }));
		await user.click(screen.getByRole('option', { name: 'Напоминания' }));

		await waitFor(() =>
			expect(requests.at(-1)?.get('action')).toBe('reminder.*')
		);
		expect(router.state.location.search).toEqual({ action: 'reminders' });
	});

	it('ссылка с автором выбирает его и запрашивает его записи', async () => {
		const requests = serveAudit([paid]);

		renderApp('/audit?actor=buh.petrova@company.ru');

		expect(
			await screen.findByRole('row', { name: /Отметка оплаты/ })
		).toBeInTheDocument();
		expect(screen.getByRole('combobox', { name: 'Кто' })).toHaveValue(
			'buh.petrova@company.ru'
		);
		expect(requests[0]?.get('actorLogin')).toBe('buh.petrova@company.ru');
	});

	it('«Показать ещё» догружает записи до конца', async () => {
		const many = Array.from({ length: 70 }, (_, index) =>
			entry({ id: `e-${index}`, at: local(10, 24, 9, 0) })
		);
		const requests = serveAudit(many);
		const user = setupUser();

		renderApp('/audit');

		expect(await screen.findByText('70 записей')).toBeInTheDocument();
		expect(screen.getAllByRole('row', { name: /Вход/ })).toHaveLength(50);
		expect(screen.getByText(/Показаны 50 из 70/)).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Показать ещё' }));

		await waitFor(() =>
			expect(screen.getAllByRole('row', { name: /Вход/ })).toHaveLength(70)
		);
		expect(requests.at(-1)?.get('offset')).toBe('50');
		expect(
			screen.getByText(/Показаны все записи за период/)
		).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Показать ещё' })
		).not.toBeInTheDocument();
	});

	it('пусто с фильтром: «Сбросить фильтры» очищает адрес', async () => {
		serveAudit([]);

		const user = setupUser();
		const { router } = renderApp('/audit?action=departments');

		expect(await screen.findByText('Записей нет')).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));

		await waitFor(() => expect(router.state.location.search).toEqual({}));
	});

	it('ошибка загрузки и повтор', async () => {
		let fail = true;

		serveAudit([login]);
		apiServer.use(
			handleListAuditLog(() =>
				fail
					? HttpResponse.json(apiErrorBody(500, 'internal'), { status: 500 })
					: HttpResponse.json({ items: [login], total: 1 })
			)
		);

		const user = setupUser();

		renderApp('/audit');

		expect(
			await screen.findByText('Не удалось загрузить журнал')
		).toBeInTheDocument();

		fail = false;
		await user.click(screen.getByRole('button', { name: 'Повторить' }));

		expect(
			await screen.findByRole('row', { name: /Вход/ })
		).toBeInTheDocument();
	});

	it('на телефоне карточки вместо таблицы', async () => {
		stubMatchMedia({ width: 390 });
		serveAudit([login, paid]);
		renderApp('/audit');

		const today = await screen.findByRole('region', {
			name: 'Сегодня, 25.10.2026',
		});

		expect(within(today).getByText('Вход')).toBeInTheDocument();
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
		expect(
			screen.getByText('Интернет в офисе, срок 20.10.2026')
		).toBeInTheDocument();
	});
});
