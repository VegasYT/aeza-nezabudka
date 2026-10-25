import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import type { User, UserUpdate } from '@shared/api';
import {
	apiErrorBody,
	apiErrorResponse,
	apiServer,
	handleCreateUser,
	handleDeleteUser,
	handleListUsers,
	handleUpdateUser,
	renderWithQuery,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';

import { UsersPage } from './users-page';

function member(overrides: Partial<User>): User {
	return {
		id: 'id-user',
		email: 'buh.petrova@company.ru',
		role: 'user',
		enabled: true,
		editable: true,
		linked: true,
		createdAt: '2026-09-01T09:00:00Z',
		lastLoginAt: null,
		lastSeenAt: '2026-10-22T11:14:00Z',
		...overrides,
	};
}

const admin = member({
	id: 'id-admin',
	email: 'a.smirnov@company.ru',
	role: 'admin',
	editable: false,
});
const petrova = member({});
const erp = member({
	id: 'id-erp',
	email: 'erp@company.ru',
	role: 'integration',
});

/** Белый список на «сервере»: запись меняет его, список отдаёт текущее состояние. */
function serveMembers(initial: User[]) {
	let members = [...initial];
	const requests: { method: string; id?: string; body?: unknown }[] = [];

	apiServer.use(
		handleListUsers(() =>
			HttpResponse.json({ items: members, total: members.length })
		),
		handleCreateUser(async ({ request }) => {
			const body = (await request.json()) as {
				email: string;
				role: User['role'];
			};
			const created = member({
				id: `id-${body.email}`,
				email: body.email,
				role: body.role,
				lastSeenAt: null,
			});

			requests.push({ method: 'POST', body });
			members = [...members, created];

			return HttpResponse.json(created, { status: 201 });
		}),
		handleUpdateUser(async ({ request, params }) => {
			const body = (await request.json()) as UserUpdate;
			const id = String(params.user_id);

			requests.push({ method: 'PATCH', id, body });
			members = members.map((m) =>
				m.id === id
					? {
							...m,
							role: body.role ?? m.role,
							enabled: body.enabled ?? m.enabled,
						}
					: m
			);

			return HttpResponse.json(members.find((m) => m.id === id));
		}),
		handleDeleteUser(({ params }) => {
			const id = String(params.user_id);

			requests.push({ method: 'DELETE', id });
			members = members.filter((m) => m.id !== id);

			return new HttpResponse(null, { status: 204 });
		})
	);

	return {
		requests,
		remove: (id: string) => {
			members = members.filter((m) => m.id !== id);
		},
	};
}

function renderPage() {
	renderWithQuery(<UsersPage />);

	return userEvent.setup();
}

async function openMenu(
	user: ReturnType<typeof userEvent.setup>,
	email: string
) {
	await user.click(
		await screen.findByRole('button', { name: `Действия: ${email}` })
	);
}

function row(email: string) {
	const cell = screen.getByText(email);
	const tableRow = cell.closest('tr');

	if (!tableRow) {
		throw new Error(`Нет строки ${email}`);
	}

	return within(tableRow);
}

beforeEach(() => {
	stubMatchMedia({ width: 1440 });
	signIn('admin');
});

describe('список участников', () => {
	it('показывает всех участников, администратор из настроек без действий', async () => {
		serveMembers([admin, petrova, erp]);
		renderPage();

		expect(await screen.findByText('a.smirnov@company.ru')).toBeInTheDocument();
		expect(row('a.smirnov@company.ru').getByText('это вы')).toBeInTheDocument();
		expect(
			row('a.smirnov@company.ru').getByText('Администратор')
		).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Действия: a.smirnov@company.ru' })
		).not.toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'Действия: buh.petrova@company.ru' })
		).toBeInTheDocument();
		expect(row('erp@company.ru').getByText('Интеграция')).toBeInTheDocument();
	});

	it('без активности пишет, что входа ещё не было', async () => {
		serveMembers([admin, member({ lastSeenAt: null })]);
		renderPage();

		expect(await screen.findByText('Входа ещё не было')).toBeInTheDocument();
	});

	it('ошибка загрузки и повтор', async () => {
		let calls = 0;

		apiServer.use(
			handleListUsers(() => {
				calls += 1;

				return calls === 1
					? HttpResponse.json(apiErrorBody(500, 'internal_error'), {
							status: 500,
						})
					: HttpResponse.json({ items: [admin, petrova], total: 2 });
			})
		);

		const user = renderPage();

		expect(
			await screen.findByText('Не удалось загрузить участников')
		).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Повторить' }));

		expect(
			await screen.findByText('buh.petrova@company.ru')
		).toBeInTheDocument();
	});

	it('только администраторы: пояснение и кнопка добавления', async () => {
		serveMembers([admin]);
		renderPage();

		expect(
			await screen.findByText('Пока входить могут только администраторы')
		).toBeInTheDocument();
		expect(
			screen.getAllByRole('button', { name: 'Добавить участника' })
		).toHaveLength(2);
	});
});

describe('добавление участника', () => {
	it('отправляет email и роль, участник появляется в списке', async () => {
		const server = serveMembers([admin]);
		const user = renderPage();

		await screen.findByText('a.smirnov@company.ru');
		await user.click(
			screen.getAllByRole('button', { name: 'Добавить участника' })[0]!
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Добавить участника',
		});

		await user.type(
			within(dialog).getByLabelText('Email аккаунта Aéza'),
			'  new@company.ru '
		);
		await user.click(within(dialog).getByRole('radio', { name: /Интеграция/ }));
		await user.click(within(dialog).getByRole('button', { name: 'Добавить' }));

		await waitFor(() =>
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
		);
		expect(server.requests).toEqual([
			{
				method: 'POST',
				body: { email: 'new@company.ru', role: 'integration' },
			},
		]);
		expect(await screen.findByText('new@company.ru')).toBeInTheDocument();
	});

	it('email уже в списке: окно остаётся с текстом под полем', async () => {
		serveMembers([admin]);
		apiServer.use(handleCreateUser(apiErrorResponse(409, 'login_taken')));

		const user = renderPage();

		await screen.findByText('a.smirnov@company.ru');
		await user.click(
			screen.getAllByRole('button', { name: 'Добавить участника' })[0]!
		);

		const dialog = await screen.findByRole('dialog');

		await user.type(
			within(dialog).getByLabelText('Email аккаунта Aéza'),
			'buh.petrova@company.ru'
		);
		await user.click(within(dialog).getByRole('button', { name: 'Добавить' }));

		expect(
			await within(dialog).findByText('Этот email уже есть в списке')
		).toBeInTheDocument();
		expect(screen.getByRole('dialog')).toBeInTheDocument();
	});

	it('пустой email не отправляется', async () => {
		const server = serveMembers([admin]);
		const user = renderPage();

		await screen.findByText('a.smirnov@company.ru');
		await user.click(
			screen.getAllByRole('button', { name: 'Добавить участника' })[0]!
		);

		const dialog = await screen.findByRole('dialog');

		await user.click(within(dialog).getByRole('button', { name: 'Добавить' }));

		expect(
			await within(dialog).findByText('Введите email')
		).toBeInTheDocument();
		expect(server.requests).toEqual([]);
	});
});

describe('действия с участником', () => {
	it('смена роли: без изменения кнопка недоступна, затем PATCH роли', async () => {
		const server = serveMembers([admin, petrova]);
		const user = renderPage();

		await openMenu(user, 'buh.petrova@company.ru');
		await user.click(screen.getByRole('menuitem', { name: 'Сменить роль' }));

		const dialog = await screen.findByRole('dialog', { name: 'Сменить роль' });
		const confirm = within(dialog).getByRole('button', {
			name: 'Сменить роль',
		});

		expect(confirm).toBeDisabled();

		await user.click(within(dialog).getByRole('radio', { name: /Интеграция/ }));
		await user.click(confirm);

		await waitFor(() =>
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
		);
		expect(server.requests).toEqual([
			{ method: 'PATCH', id: 'id-user', body: { role: 'integration' } },
		]);
		expect(
			await row('buh.petrova@company.ru').findByText('Интеграция')
		).toBeInTheDocument();
	});

	it('отключение после подтверждения и включение сразу', async () => {
		const server = serveMembers([admin, petrova]);
		const user = renderPage();

		await openMenu(user, 'buh.petrova@company.ru');
		await user.click(
			screen.getByRole('menuitem', { name: 'Отключить доступ' })
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Отключить доступ?',
		});

		await user.click(within(dialog).getByRole('button', { name: 'Отключить' }));

		expect(
			await row('buh.petrova@company.ru').findByText('Отключён')
		).toBeInTheDocument();

		await openMenu(user, 'buh.petrova@company.ru');
		await user.click(screen.getByRole('menuitem', { name: 'Включить доступ' }));

		expect(
			await row('buh.petrova@company.ru').findByText('Включён')
		).toBeInTheDocument();
		expect(server.requests).toEqual([
			{ method: 'PATCH', id: 'id-user', body: { enabled: false } },
			{ method: 'PATCH', id: 'id-user', body: { enabled: true } },
		]);
	});

	it('удаление после подтверждения, «Отмена» ничего не отправляет', async () => {
		const server = serveMembers([admin, petrova]);
		const user = renderPage();

		await openMenu(user, 'buh.petrova@company.ru');
		await user.click(
			screen.getByRole('menuitem', { name: 'Удалить из\u00a0списка' })
		);
		await user.click(
			within(await screen.findByRole('dialog')).getByRole('button', {
				name: 'Отмена',
			})
		);

		expect(server.requests).toEqual([]);

		await openMenu(user, 'buh.petrova@company.ru');
		await user.click(
			screen.getByRole('menuitem', { name: 'Удалить из\u00a0списка' })
		);
		await user.click(
			within(
				await screen.findByRole('dialog', { name: 'Удалить из\u00a0списка?' })
			).getByRole('button', { name: 'Удалить' })
		);

		await waitFor(() =>
			expect(
				screen.queryByText('buh.petrova@company.ru')
			).not.toBeInTheDocument()
		);
		expect(server.requests).toEqual([{ method: 'DELETE', id: 'id-user' }]);
	});

	it('участника уже удалили: сообщение и обновлённый список', async () => {
		const server = serveMembers([admin, petrova]);

		apiServer.use(
			handleUpdateUser(() => {
				server.remove('id-user');

				return HttpResponse.json(apiErrorBody(404, 'not_found'), {
					status: 404,
				});
			})
		);

		const user = renderPage();

		await openMenu(user, 'buh.petrova@company.ru');
		await user.click(
			screen.getByRole('menuitem', { name: 'Отключить доступ' })
		);

		const dialog = await screen.findByRole('dialog');

		await user.click(within(dialog).getByRole('button', { name: 'Отключить' }));

		expect(
			await within(dialog).findByText('Участник не найден: его уже удалили.')
		).toBeInTheDocument();
		await waitFor(() =>
			expect(
				within(screen.getByRole('table')).queryByText('buh.petrova@company.ru')
			).not.toBeInTheDocument()
		);
	});
});

describe('телефон', () => {
	it('участники списком, у редактируемых кнопка меню', async () => {
		stubMatchMedia({ width: 390 });
		serveMembers([admin, petrova]);
		renderPage();

		expect(
			await screen.findByRole('button', {
				name: 'Действия: buh.petrova@company.ru',
			})
		).toBeInTheDocument();
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'Добавить участника' })
		).toBeInTheDocument();
	});
});
