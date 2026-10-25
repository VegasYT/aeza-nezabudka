import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Department, GroupChat, RecurringPayment } from '@shared/api';
import {
	apiErrorBody,
	apiErrorResponse,
	apiServer,
	handleCreateDepartment,
	handleDeleteDepartment,
	handleListDepartments,
	handleListGroupChats,
	handleListRecurringPayments,
	handleUpdateDepartment,
	renderWithQuery,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';

import { DepartmentsPage } from './departments-page';

const it_ = { id: 'd-it', name: 'ИТ', paymentsCount: 1 };
const office = { id: 'd-office', name: 'Офис', paymentsCount: 2 };
const store = { id: 'd-store', name: 'Склад', paymentsCount: 0 };

function payment(name: string, departmentId: string): RecurringPayment {
	return {
		id: `p-${name}`,
		name,
		amountMinor: 100,
		currency: 'RUB',
		period: 'month',
		periodCount: 1,
		occurrenceLimit: null,
		paidOccurrences: 0,
		completed: false,
		anchorDay: 5,
		nextDueDate: '2026-11-05',
		overdueCount: 0,
		oldestOverdueDays: null,
		department: { id: departmentId, name: '' },
		stoppedAt: null,
		createdAt: '2026-09-01T09:00:00Z',
		createdByLogin: 'a.smirnov@company.ru',
	};
}

function chat(title: string, departmentIds: string[] | null): GroupChat {
	return {
		id: `c-${title}`,
		title,
		threadId: null,
		topicName: null,
		departmentIds,
		blocked: false,
		linkedAt: '2026-10-20T10:00:00Z',
	};
}

const payments = [
	payment('Аренда офиса', 'd-office'),
	payment('Подписка', 'd-office'),
	payment('Сервер', 'd-it'),
];

/** Справочник отделов на «сервере»: запись меняет его, список отдаёт текущее состояние. */
function serveDepartments(initial: Department[], chats: GroupChat[] = []) {
	let departments = [...initial];
	const requests: { method: string; id?: string; body?: unknown }[] = [];

	apiServer.use(
		handleListDepartments(() =>
			HttpResponse.json({ items: departments, total: departments.length })
		),
		handleListRecurringPayments(({ request }) => {
			const departmentId = new URL(request.url).searchParams.get(
				'departmentId'
			);
			const items = payments.filter((p) => p.department?.id === departmentId);

			return HttpResponse.json({ items, total: items.length });
		}),
		handleListGroupChats({ body: { items: chats, total: chats.length } }),
		handleCreateDepartment(async ({ request }) => {
			const body = (await request.json()) as { name: string };
			const created = {
				id: `d-${body.name}`,
				name: body.name,
				paymentsCount: 0,
			};

			requests.push({ method: 'POST', body });
			departments = [...departments, created];

			return HttpResponse.json(created, { status: 201 });
		}),
		handleUpdateDepartment(async ({ request, params }) => {
			const body = (await request.json()) as { name: string };
			const id = String(params.department_id);

			requests.push({ method: 'PATCH', id, body });
			departments = departments.map((d) =>
				d.id === id ? { ...d, name: body.name } : d
			);

			return HttpResponse.json(departments.find((d) => d.id === id));
		}),
		handleDeleteDepartment(({ params }) => {
			const id = String(params.department_id);

			requests.push({ method: 'DELETE', id });
			departments = departments.filter((d) => d.id !== id);

			return new HttpResponse(null, { status: 204 });
		})
	);

	return {
		requests,
		remove: (id: string) => {
			departments = departments.filter((d) => d.id !== id);
		},
	};
}

function renderPage() {
	renderWithQuery(<DepartmentsPage />);

	return userEvent.setup();
}

function row(name: string) {
	const tableRow = screen.getByRole('cell', { name }).closest('tr');

	if (!tableRow) {
		throw new Error(`Нет строки ${name}`);
	}

	return within(tableRow);
}

async function openDelete(
	user: ReturnType<typeof userEvent.setup>,
	name: string
) {
	await user.click(
		await screen.findByRole('button', { name: `Удалить «${name}»` })
	);

	return screen.findByRole('dialog', { name: 'Удалить отдел?' });
}

beforeEach(() => {
	stubMatchMedia({ width: 1440 });
	signIn('admin');
});

describe('список отделов', () => {
	it('название и число действующих платежей', async () => {
		serveDepartments([it_, office, store]);
		renderPage();

		expect(await screen.findByRole('cell', { name: 'ИТ' })).toBeInTheDocument();
		expect(row('ИТ').getByText('1 платёж')).toBeInTheDocument();
		expect(row('Офис').getByText('2 платежа')).toBeInTheDocument();
		expect(
			row('Склад').getByLabelText('Нет действующих платежей')
		).toBeInTheDocument();
	});

	it('отделов нет', async () => {
		serveDepartments([]);
		renderPage();

		expect(await screen.findByText('Отделов пока нет')).toBeInTheDocument();
		expect(
			screen.getAllByRole('button', { name: 'Добавить отдел' })
		).toHaveLength(2);
	});

	it('ошибка загрузки и повтор', async () => {
		let calls = 0;

		apiServer.use(
			handleListDepartments(() => {
				calls += 1;

				return calls === 1
					? HttpResponse.json(apiErrorBody(500, 'internal_error'), {
							status: 500,
						})
					: HttpResponse.json({ items: [it_], total: 1 });
			})
		);

		const user = renderPage();

		expect(
			await screen.findByText('Не удалось загрузить отделы')
		).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Повторить' }));

		expect(await screen.findByRole('cell', { name: 'ИТ' })).toBeInTheDocument();
	});
});

describe('создание и переименование', () => {
	it('создаёт отдел без пробелов по краям', async () => {
		const server = serveDepartments([it_]);
		const user = renderPage();

		await screen.findByRole('cell', { name: 'ИТ' });
		await user.click(screen.getByRole('button', { name: 'Добавить отдел' }));

		const dialog = await screen.findByRole('dialog', { name: 'Новый отдел' });

		await user.type(within(dialog).getByLabelText('Название'), '  Склад ');
		await user.click(within(dialog).getByRole('button', { name: 'Создать' }));

		await waitFor(() =>
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
		);
		expect(server.requests).toEqual([
			{ method: 'POST', body: { name: 'Склад' } },
		]);
		expect(
			await screen.findByRole('cell', { name: 'Склад' })
		).toBeInTheDocument();
	});

	it('переименовывает отдел', async () => {
		const server = serveDepartments([it_]);
		const user = renderPage();

		await user.click(
			await screen.findByRole('button', { name: 'Переименовать «ИТ»' })
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Переименовать отдел',
		});
		const input = within(dialog).getByLabelText('Название');

		expect(input).toHaveValue('ИТ');

		await user.clear(input);
		await user.type(input, 'Инфраструктура');
		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		expect(
			await screen.findByRole('cell', { name: 'Инфраструктура' })
		).toBeInTheDocument();
		expect(server.requests).toEqual([
			{ method: 'PATCH', id: 'd-it', body: { name: 'Инфраструктура' } },
		]);
	});

	it('занятое название: окно остаётся с текстом под полем', async () => {
		serveDepartments([office]);
		apiServer.use(
			handleCreateDepartment(apiErrorResponse(409, 'department_name_taken'))
		);

		const user = renderPage();

		await screen.findByRole('cell', { name: 'Офис' });
		await user.click(screen.getByRole('button', { name: 'Добавить отдел' }));

		const dialog = await screen.findByRole('dialog');

		await user.type(within(dialog).getByLabelText('Название'), 'офис');
		await user.click(within(dialog).getByRole('button', { name: 'Создать' }));

		expect(
			await within(dialog).findByText('Отдел с таким названием уже есть')
		).toBeInTheDocument();
	});

	it('пустое название не отправляется', async () => {
		const server = serveDepartments([office]);
		const user = renderPage();

		await screen.findByRole('cell', { name: 'Офис' });
		await user.click(screen.getByRole('button', { name: 'Добавить отдел' }));

		const dialog = await screen.findByRole('dialog');

		await user.type(within(dialog).getByLabelText('Название'), '   ');
		await user.click(within(dialog).getByRole('button', { name: 'Создать' }));

		expect(
			await within(dialog).findByText('Введите название')
		).toBeInTheDocument();
		expect(server.requests).toEqual([]);
	});
});

describe('удаление отдела', () => {
	it('называет платежи, которые останутся без отдела', async () => {
		serveDepartments([it_, office]);

		const user = renderPage();
		const dialog = await openDelete(user, 'Офис');

		expect(
			await within(dialog).findByText(
				'2 действующих платежа останутся без отдела: Аренда офиса, Подписка.'
			)
		).toBeInTheDocument();
		expect(
			within(dialog).getByText(
				/Личные напоминания, где выбран только этот отдел/
			)
		).toBeInTheDocument();
	});

	it('пустой отдел', async () => {
		serveDepartments([store]);

		const user = renderPage();
		const dialog = await openDelete(user, 'Склад');

		expect(
			within(dialog).getByText('В отделе нет действующих платежей.')
		).toBeInTheDocument();
	});

	it('говорит, что станет с групповыми чатами этого отдела', async () => {
		serveDepartments(
			[it_, office],
			[
				chat('ИТ-дежурные', ['d-it']),
				chat('Бухгалтерия', ['d-it', 'd-office']),
				chat('Офис-чат', ['d-office']),
				chat('Все платежи', null),
			]
		);

		const user = renderPage();
		const dialog = await openDelete(user, 'ИТ');

		expect(
			await within(dialog).findByText(
				/«ИТ-дежурные» получает напоминания только по этому отделу.+по всем платежам/
			)
		).toBeInTheDocument();
		expect(
			within(dialog).getByText(
				/«Бухгалтерия» перестанет получать напоминания по этому отделу/
			)
		).toBeInTheDocument();
		expect(within(dialog).queryByText(/Офис-чат/)).not.toBeInTheDocument();
		expect(within(dialog).queryByText(/Все платежи/)).not.toBeInTheDocument();
	});

	it('подтверждение удаляет отдел', async () => {
		const server = serveDepartments([it_, office]);
		const user = renderPage();
		const dialog = await openDelete(user, 'ИТ');

		await user.click(
			within(dialog).getByRole('button', { name: 'Удалить отдел' })
		);

		await waitFor(() =>
			expect(screen.queryByRole('cell', { name: 'ИТ' })).not.toBeInTheDocument()
		);
		expect(server.requests).toEqual([{ method: 'DELETE', id: 'd-it' }]);
	});

	it('ошибка загрузки чатов не мешает удалению', async () => {
		const server = serveDepartments([it_]);

		apiServer.use(
			handleListGroupChats(apiErrorResponse(500, 'internal_error'))
		);

		const user = renderPage();
		const dialog = await openDelete(user, 'ИТ');

		await user.click(
			within(dialog).getByRole('button', { name: 'Удалить отдел' })
		);

		await waitFor(() => expect(server.requests).toHaveLength(1));
	});

	it('отдел уже удалили: сообщение и обновлённый список', async () => {
		const server = serveDepartments([it_, office]);

		apiServer.use(
			handleDeleteDepartment(() => {
				server.remove('d-it');

				return HttpResponse.json(apiErrorBody(404, 'not_found'), {
					status: 404,
				});
			})
		);

		const user = renderPage();
		const dialog = await openDelete(user, 'ИТ');

		await user.click(
			within(dialog).getByRole('button', { name: 'Удалить отдел' })
		);

		expect(
			await within(dialog).findByText('Отдел не найден: его уже удалили.')
		).toBeInTheDocument();
		await waitFor(() =>
			expect(
				within(screen.getByRole('table')).queryByText('ИТ')
			).not.toBeInTheDocument()
		);
	});
});

describe('телефон', () => {
	it('отделы списком с кнопками действий', async () => {
		stubMatchMedia({ width: 390 });
		serveDepartments([it_]);
		renderPage();

		expect(
			await screen.findByRole('button', { name: 'Переименовать «ИТ»' })
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'Удалить «ИТ»' })
		).toBeInTheDocument();
		expect(screen.getByText('1 действующий платёж')).toBeInTheDocument();
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
	});
});
