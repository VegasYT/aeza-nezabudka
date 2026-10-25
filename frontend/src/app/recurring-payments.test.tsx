import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
	PaymentOccurrence,
	RecurringPayment,
	RecurringPaymentCreate,
	RecurringPaymentUpdate,
} from '@shared/api';
import {
	apiErrorBody,
	apiServer,
	handleCreateRecurringPayment,
	handleListRecurringPayments,
	handleResumeRecurringPayment,
	handleStopRecurringPayment,
	handleUpdateRecurringPayment,
	serveRecurringScreen,
	serveSettings,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';

import { renderApp } from './test-router';

// getByText сводит неразрывные пробелы к обычным, доступные имена - нет.
const nbsp = '\u00a0';
// «19-го» набирается неразрывным дефисом.
const nbh = '\u2011';
const office = { id: 'd-office', name: 'Офис' };
const itDept = { id: 'd-it', name: 'ИТ' };

function payment(overrides: Partial<RecurringPayment>): RecurringPayment {
	return {
		id: 'p-rent',
		name: 'Аренда офиса',
		amountMinor: 15_000_000,
		currency: 'RUB',
		period: 'month',
		periodCount: 1,
		occurrenceLimit: null,
		reminderDaysBefore: null,
		paidOccurrences: 0,
		completed: false,
		anchorDay: 19,
		nextDueDate: '2026-11-19',
		overdueCount: 1,
		oldestOverdueDays: 5,
		department: office,
		stoppedAt: null,
		createdAt: '2026-09-15T09:00:00Z',
		createdByLogin: 'a.smirnov@company.ru',
		...overrides,
	};
}

function occurrence(
	dueDate: string,
	overrides: Partial<PaymentOccurrence> = {}
): PaymentOccurrence {
	return {
		id: `o-rent-${dueDate}`,
		recurringPayment: { id: 'p-rent', name: 'Аренда офиса', stopped: false },
		department: office,
		dueDate,
		amountMinor: 15_000_000,
		currency: 'RUB',
		paid: false,
		paidOn: null,
		paidByLogin: null,
		overdue: false,
		daysOverdue: 0,
		...overrides,
	};
}

/** Платежи стенда по алфавиту, как их отдаёт сервер; свежие копии на каждый тест. */
function seedPayments() {
	return [
		payment({}),
		payment({
			id: 'p-internet',
			name: 'Интернет в офисе',
			amountMinor: 490_000,
			anchorDay: 20,
			nextDueDate: '2026-11-20',
			overdueCount: 0,
			oldestOverdueDays: null,
			department: null,
		}),
		payment({
			id: 'p-cloud',
			name: 'Облачное хранилище',
			amountMinor: 999,
			currency: 'EUR',
			anchorDay: 5,
			nextDueDate: null,
			oldestOverdueDays: 19,
			department: itDept,
			stoppedAt: '2026-10-12T10:00:00Z',
		}),
		payment({
			id: 'p-subscription',
			name: 'Подписка',
			amountMinor: 1_299,
			currency: 'EUR',
			anchorDay: 31,
			nextDueDate: '2026-10-31',
			oldestOverdueDays: 24,
		}),
		payment({
			id: 'p-server',
			name: 'Сервер',
			amountMinor: 2_500,
			currency: 'USD',
			anchorDay: 26,
			nextDueDate: '2026-10-26',
			overdueCount: 0,
			oldestOverdueDays: null,
			department: itDept,
		}),
	];
}

const rentHistory = [
	occurrence('2026-09-19', {
		paid: true,
		paidOn: '2026-09-19',
		paidByLogin: 'buh.petrova@company.ru',
	}),
	occurrence('2026-10-19', { overdue: true, daysOverdue: 5 }),
	occurrence('2026-11-19'),
];

let payments: RecurringPayment[];

beforeEach(() => {
	stubMatchMedia({ width: 1440 });
	signIn('admin');
	payments = seedPayments();
	serveRecurringScreen({
		payments,
		occurrences: rentHistory,
		departments: [
			{ ...itDept, paymentsCount: 1 },
			{ ...office, paymentsCount: 2 },
		],
	});
});

function byId(id: string) {
	const found = payments.find((item) => item.id === id);

	if (!found) {
		throw new Error(`Нет платежа ${id}`);
	}

	return found;
}

async function pickDay(
	user: ReturnType<typeof userEvent.setup>,
	dialog: HTMLElement,
	day: string
) {
	await user.click(within(dialog).getByLabelText('Дата ближайшей оплаты'));
	await user.click(within(dialog).getByRole('button', { name: day }));
}

describe('список регулярных платежей', () => {
	it('показывает расписание, сумму, ближайший срок, отдел и метки', async () => {
		renderApp('/recurring-payments');

		const rent = await screen.findByRole('row', { name: /Аренда офиса/ });

		expect(rent).toHaveTextContent('просрочено 5 дн.');
		expect(rent).toHaveTextContent(`ежемесячно, 19${nbh}го числа`);
		expect(rent).toHaveTextContent('150 000,00 ₽');
		expect(rent).toHaveTextContent(/19\.11\.2026\s*через 26 дней/);
		expect(rent).toHaveTextContent('Офис');
		expect(
			within(rent).getByRole('button', { name: 'Изменить: Аренда офиса' })
		).toBeInTheDocument();
		expect(screen.getByRole('row', { name: /Сервер/ })).toHaveTextContent(
			'через 2 дня'
		);
		expect(screen.getByRole('row', { name: /Подписка/ })).toHaveTextContent(
			'ежемесячно, в последний день месяца'
		);
		expect(screen.queryByText('Облачное хранилище')).not.toBeInTheDocument();
		expect(
			await screen.findByText('4 платежа, по алфавиту')
		).toBeInTheDocument();
		expect(
			await screen.findByRole('radio', { name: 'Прекращённые 1' })
		).toBeInTheDocument();
	});

	it('«Прекращённые» и «Без отдела» попадают в адрес и в запрос', async () => {
		const user = userEvent.setup();
		const { router } = renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('radio', { name: /Прекращённые/ })
		);

		const cloud = await screen.findByRole('row', {
			name: /Облачное хранилище/,
		});

		expect(cloud).toHaveTextContent('прекращён 12.10.2026');
		expect(
			within(cloud)
				.getAllByRole('button')
				.map(({ ariaLabel }) => ariaLabel)
		).toEqual(['Возобновить: Облачное хранилище']);
		expect(router.state.location.search).toEqual({ status: 'stopped' });

		await user.click(screen.getByRole('combobox', { name: 'Отдел' }));
		await user.click(screen.getByRole('option', { name: 'Без отдела' }));

		expect(await screen.findByText('Таких платежей нет')).toBeInTheDocument();
		expect(router.state.location.search).toEqual({
			status: 'stopped',
			dept: 'none',
		});

		await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));

		expect(
			await screen.findByRole('row', { name: /Аренда офиса/ })
		).toBeInTheDocument();
		expect(router.state.location.search).toEqual({});
	});

	it('ссылка с фильтрами открывает их выбранными', async () => {
		renderApp('/recurring-payments?dept=none&status=all');

		expect(
			await screen.findByRole('row', { name: /Интернет в офисе/ })
		).toBeInTheDocument();
		expect(screen.queryByText('Аренда офиса')).not.toBeInTheDocument();
		expect(screen.getByRole('radio', { name: /Все/ })).toBeChecked();
		expect(screen.getByRole('combobox', { name: 'Отдел' })).toHaveValue(
			'Без отдела'
		);
	});

	it('после ошибки загрузки «Повторить» показывает список', async () => {
		apiServer.use(
			handleListRecurringPayments(() =>
				HttpResponse.json(apiErrorBody(500, 'internal_error'), {
					status: 500,
				})
			)
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		expect(
			await screen.findByText('Не удалось загрузить регулярные платежи')
		).toBeInTheDocument();

		serveRecurringScreen({ payments });
		await user.click(screen.getByRole('button', { name: 'Повторить' }));

		expect(
			await screen.findByRole('row', { name: /Аренда офиса/ })
		).toBeInTheDocument();
	});

	it('расписание показывает периодичность платежа', async () => {
		serveRecurringScreen({
			payments: [
				payment({
					id: 'p-domain',
					name: 'Домен',
					period: 'year',
					anchorDay: 5,
					nextDueDate: '2026-11-05',
					overdueCount: 0,
					oldestOverdueDays: null,
				}),
				payment({
					id: 'p-cleaning',
					name: 'Уборка',
					period: 'week',
					periodCount: 2,
					anchorDay: 26,
					nextDueDate: '2026-10-26',
					overdueCount: 0,
					oldestOverdueDays: null,
				}),
			],
		});

		renderApp('/recurring-payments');

		expect(await screen.findByRole('row', { name: /Домен/ })).toHaveTextContent(
			'ежегодно, 5 ноября'
		);
		expect(screen.getByRole('row', { name: /Уборка/ })).toHaveTextContent(
			'раз в две недели, по понедельникам'
		);
	});

	it('завершённый платёж помечен, вместо срока - «все оплаты сделаны»', async () => {
		Object.assign(byId('p-internet'), {
			occurrenceLimit: 4,
			paidOccurrences: 4,
			completed: true,
			nextDueDate: null,
		});

		renderApp('/recurring-payments');

		const row = await screen.findByRole('row', { name: /Интернет в офисе/ });

		expect(row).toHaveTextContent('завершён');
		expect(row).toHaveTextContent(
			`ежемесячно, 20${nbh}го числа · оплачено 4 из 4`
		);
		expect(row).toHaveTextContent('все оплаты сделаны');
	});

	it('пустой раздел предлагает добавить платёж', async () => {
		serveRecurringScreen();

		renderApp('/recurring-payments');

		expect(
			await screen.findByRole('heading', {
				name: 'Регулярных платежей пока нет',
			})
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'Добавить платёж' })
		).toBeInTheDocument();
	});
});

describe('карточка платежа', () => {
	it('по ссылке показывает историю от новых к старым и следующий период', async () => {
		renderApp('/recurring-payments/p-rent');

		const card = await screen.findByRole('dialog', { name: 'Аренда офиса' });
		const history = await within(card).findByRole('table');
		const rows = within(history).getAllByRole('row').slice(1);

		expect(rows.map((row) => row.textContent?.slice(0, 10))).toEqual([
			'19.11.2026',
			'19.10.2026',
			'19.09.2026',
		]);
		expect(rows[0]).toHaveTextContent('Не оплачено');
		expect(rows[1]).toHaveTextContent('Просрочено 5 дн.');
		expect(rows[2]).toHaveTextContent(/Оплачено\s*19\.09\.2026/);
		expect(rows[2]).toHaveTextContent('buh.petrova@company.ru');
		expect(
			within(card).getByText('Период 19.12.2026 появится 19.11.2026.')
		).toBeInTheDocument();
		expect(
			within(card).getByRole('button', { name: 'Изменить' })
		).toBeInTheDocument();
	});

	it('строка «Напоминание»: своё окно платежа или общее', async () => {
		Object.assign(byId('p-rent'), { reminderDaysBefore: 7 });

		renderApp('/recurring-payments/p-rent');

		const facts = await screen.findByRole('region', { name: 'О платеже' });

		expect(facts).toHaveTextContent(/Напоминание\s*За 7 дней до срока/);
		expect(within(facts).getByText('своё у платежа')).toBeInTheDocument();
	});

	it('у платежа с созданными по ограничению периодами не обещает следующий', async () => {
		Object.assign(byId('p-rent'), { occurrenceLimit: 3, paidOccurrences: 1 });

		renderApp('/recurring-payments/p-rent');

		const card = await screen.findByRole('dialog', { name: 'Аренда офиса' });

		expect(
			await within(card).findByText(
				'Новых периодов не будет: все периоды по числу оплат уже появились.'
			)
		).toBeInTheDocument();
		expect(within(card).getByText('Оплачено 1 из 3')).toBeInTheDocument();
		expect(within(card).queryByText(/появится/)).not.toBeInTheDocument();
	});

	it('закрытие возвращает к списку с прежними фильтрами', async () => {
		const user = userEvent.setup();
		const { router } = renderApp('/recurring-payments?status=all');

		await user.click(await screen.findByRole('link', { name: 'Аренда офиса' }));

		const card = await screen.findByRole('dialog', { name: 'Аренда офиса' });

		expect(router.state.location.pathname).toBe('/recurring-payments/p-rent');

		await user.click(within(card).getByRole('button', { name: 'Закрыть' }));

		await waitFor(() =>
			expect(router.state.location.pathname).toBe('/recurring-payments')
		);
		expect(router.state.location.search).toEqual({ status: 'all' });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(screen.getByRole('radio', { name: /Все/ })).toBeChecked();
	});

	it('по адресу несуществующего платежа говорит, что его нет', async () => {
		renderApp('/recurring-payments/p-missing');

		expect(
			await screen.findByRole('dialog', { name: 'Платёж не найден' })
		).toBeInTheDocument();
	});

	it('пользователь по адресу раздела и карточки видит «Нет доступа» без запросов платежей', async () => {
		signIn('user');

		const requests: string[] = [];
		const listen = ({ request }: { request: Request }) => {
			requests.push(request.url);
		};

		apiServer.events.on('request:start', listen);

		const { router } = renderApp('/recurring-payments');

		expect(
			await screen.findByRole('heading', { name: 'Нет доступа' })
		).toBeInTheDocument();

		await router.navigate({
			to: '/recurring-payments/$paymentId',
			params: { paymentId: 'p-rent' },
		});

		expect(
			await screen.findByRole('heading', { name: 'Нет доступа' })
		).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/recurring-payments/p-rent');
		apiServer.events.removeListener('request:start', listen);
		expect(requests.filter((url) => url.includes('recurring'))).toEqual([]);
	});
});

describe('создание платежа', () => {
	it('отправляет сумму в минимальных единицах и показывает платёж в списке', async () => {
		const bodies: RecurringPaymentCreate[] = [];

		apiServer.use(
			handleCreateRecurringPayment(async ({ request }) => {
				const body = (await request.json()) as RecurringPaymentCreate;

				bodies.push(body);
				payments.push(
					payment({
						id: 'p-backup',
						name: body.name,
						amountMinor: body.amountMinor,
						currency: body.currency,
						anchorDay: 26,
						nextDueDate: body.nextDueDate,
						overdueCount: 0,
						oldestOverdueDays: null,
						department: itDept,
					})
				);

				return HttpResponse.json(payments.at(-1), { status: 201 });
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Добавить платёж' })
		);

		const dialog = await screen.findByRole('dialog', { name: 'Новый платёж' });

		await user.type(
			within(dialog).getByLabelText('Название'),
			'Резервное копирование'
		);
		await user.type(within(dialog).getByLabelText('Сумма'), '15,00');
		await user.click(within(dialog).getByRole('combobox', { name: 'Валюта' }));
		await user.click(screen.getByRole('option', { name: 'USD, доллары' }));
		await pickDay(user, dialog, '26 октября 2026');

		expect(within(dialog).getByText('Срок через 2 дня.')).toBeInTheDocument();
		expect(
			within(dialog).getByText('Следующие сроки: 26.11.2026 и 26.12.2026')
		).toBeInTheDocument();

		await user.click(within(dialog).getByRole('combobox', { name: 'Отдел' }));
		await user.click(screen.getByRole('option', { name: 'ИТ' }));
		await user.click(
			within(dialog).getByRole('button', { name: 'Добавить платёж' })
		);

		await waitFor(() =>
			expect(
				screen.queryByRole('dialog', { name: 'Новый платёж' })
			).not.toBeInTheDocument()
		);
		expect(bodies).toEqual([
			{
				name: 'Резервное копирование',
				amountMinor: 1_500,
				currency: 'USD',
				nextDueDate: '2026-10-26',
				period: 'month',
				periodCount: 1,
				occurrenceLimit: null,
				reminderDaysBefore: null,
				departmentId: 'd-it',
			},
		]);
		expect(
			await screen.findByRole('row', { name: /Резервное копирование/ })
		).toBeInTheDocument();
	});

	it('своя периодичность уходит единицей и числом', async () => {
		const bodies: RecurringPaymentCreate[] = [];

		apiServer.use(
			handleCreateRecurringPayment(async ({ request }) => {
				bodies.push((await request.json()) as RecurringPaymentCreate);

				return HttpResponse.json(payment({}), { status: 201 });
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Добавить платёж' })
		);

		const dialog = await screen.findByRole('dialog', { name: 'Новый платёж' });

		await user.type(within(dialog).getByLabelText('Название'), 'Вывоз мусора');
		await user.type(within(dialog).getByLabelText('Сумма'), '3000');
		await pickDay(user, dialog, '30 октября 2026');
		await user.click(
			within(dialog).getByRole('combobox', { name: 'Периодичность' })
		);
		await user.click(
			screen.getByRole('option', { name: 'Другая периодичность' })
		);

		const count = within(dialog).getByLabelText('Раз в');

		await user.clear(count);
		await user.type(count, '10');
		await user.click(within(dialog).getByRole('combobox', { name: 'Единица' }));
		await user.click(screen.getByRole('option', { name: 'дней' }));

		expect(
			within(dialog).getByText('Следующие сроки: 09.11.2026 и 19.11.2026')
		).toBeInTheDocument();

		await user.click(
			within(dialog).getByRole('button', { name: 'Добавить платёж' })
		);

		await waitFor(() =>
			expect(bodies).toMatchObject([{ period: 'day', periodCount: 10 }])
		);
	});

	it('еженедельно в течение месяца: число оплат и последняя оплата', async () => {
		const bodies: RecurringPaymentCreate[] = [];

		apiServer.use(
			handleCreateRecurringPayment(async ({ request }) => {
				bodies.push((await request.json()) as RecurringPaymentCreate);

				return HttpResponse.json(payment({}), { status: 201 });
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Добавить платёж' })
		);

		const dialog = await screen.findByRole('dialog', { name: 'Новый платёж' });

		await user.type(within(dialog).getByLabelText('Название'), 'Уборка');
		await user.type(within(dialog).getByLabelText('Сумма'), '5000');
		await pickDay(user, dialog, '26 октября 2026');
		await user.click(
			within(dialog).getByRole('combobox', { name: 'Периодичность' })
		);

		expect(
			screen.getAllByRole('option').map((option) => option.textContent)
		).toEqual([
			'Еженедельно',
			`Раз в${nbsp}две недели`,
			'Ежемесячно',
			`Раз в${nbsp}квартал`,
			`Раз в${nbsp}полгода`,
			'Ежегодно',
			'Другая периодичность',
		]);

		await user.click(screen.getByRole('option', { name: 'Еженедельно' }));
		await user.type(within(dialog).getByLabelText('Сколько раз оплатить'), '4');

		expect(
			within(dialog).getByText('Последний срок 16.11.2026')
		).toBeInTheDocument();
		expect(
			within(dialog).getByText('Следующие сроки: 02.11.2026 и 09.11.2026')
		).toBeInTheDocument();

		await user.click(
			within(dialog).getByRole('button', { name: 'Добавить платёж' })
		);

		await waitFor(() =>
			expect(bodies).toMatchObject([
				{ period: 'week', periodCount: 1, occurrenceLimit: 4 },
			])
		);
	});

	it('пустое название и нулевая сумма не отправляют запрос', async () => {
		let sent = false;

		apiServer.use(
			handleCreateRecurringPayment(() => {
				sent = true;

				return HttpResponse.json(payment({}), { status: 201 });
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Добавить платёж' })
		);

		const dialog = await screen.findByRole('dialog', { name: 'Новый платёж' });

		await user.type(within(dialog).getByLabelText('Сумма'), '0');
		await user.click(
			within(dialog).getByRole('button', { name: 'Добавить платёж' })
		);

		expect(await within(dialog).findByText('Введите название')).toBeVisible();
		expect(
			within(dialog).getByText('Сумма должна быть больше нуля')
		).toBeVisible();
		expect(sent).toBe(false);
	});

	it('ошибка сервера по дате видна под полем, форма открыта', async () => {
		apiServer.use(
			handleCreateRecurringPayment(() =>
				HttpResponse.json(
					{
						...apiErrorBody(400, 'bad_request'),
						payload: [
							{
								field: 'nextDueDate',
								message:
									'Дата ближайшей оплаты не может быть раньше сегодняшней',
							},
						],
					},
					{ status: 400 }
				)
			)
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Добавить платёж' })
		);

		const dialog = await screen.findByRole('dialog', { name: 'Новый платёж' });

		await user.type(within(dialog).getByLabelText('Название'), 'Сервер');
		await user.type(within(dialog).getByLabelText('Сумма'), '25');
		await pickDay(user, dialog, '30 октября 2026');
		await user.click(
			within(dialog).getByRole('button', { name: 'Добавить платёж' })
		);

		expect(
			await within(dialog).findByText(
				'Дата ближайшей оплаты не может быть раньше сегодняшней'
			)
		).toBeInTheDocument();
		expect(within(dialog).getByLabelText('Название')).toHaveValue('Сервер');
	});

	it('повтор того же тела после обрыва связи идёт с тем же ключом', async () => {
		const keys: (string | null)[] = [];

		apiServer.use(
			handleCreateRecurringPayment(({ request }) => {
				keys.push(request.headers.get('Idempotency-Key'));

				return keys.length === 1
					? HttpResponse.error()
					: HttpResponse.json(payment({}), { status: 201 });
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Добавить платёж' })
		);

		const dialog = await screen.findByRole('dialog', { name: 'Новый платёж' });

		await user.type(within(dialog).getByLabelText('Название'), 'Аренда');
		await user.type(within(dialog).getByLabelText('Сумма'), '100');
		await pickDay(user, dialog, '30 октября 2026');
		await user.click(
			within(dialog).getByRole('button', { name: 'Добавить платёж' })
		);

		expect(
			await within(dialog).findByText(/Не удалось связаться с сервером/)
		).toBeInTheDocument();

		await user.click(
			within(dialog).getByRole('button', { name: 'Добавить платёж' })
		);

		await waitFor(() => expect(keys).toHaveLength(2));
		expect(keys[0]).toBeTruthy();
		expect(keys[1]).toBe(keys[0]);
	});
});

describe('изменение платежа', () => {
	it('отправляет только изменённую сумму и поясняет, какие периоды изменятся', async () => {
		const bodies: RecurringPaymentUpdate[] = [];

		apiServer.use(
			handleUpdateRecurringPayment(async ({ request }) => {
				bodies.push((await request.json()) as RecurringPaymentUpdate);

				return HttpResponse.json(byId('p-rent'));
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Изменить: Аренда офиса' })
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Изменить платёж',
		});
		const save = within(dialog).getByRole('button', { name: 'Сохранить' });

		expect(dialog).toHaveTextContent(
			'Сумма, валюта, дата и периодичность изменятся с периода 19.11.2026.'
		);
		expect(dialog).toHaveTextContent(
			'Оплаченные периоды и просроченный 19.10.2026 останутся как были.'
		);
		expect(save).toBeDisabled();

		const amount = within(dialog).getByLabelText('Сумма');

		await user.clear(amount);
		await user.type(amount, '165 000,00');

		expect(within(dialog).getByText('Было 150 000,00 ₽')).toBeInTheDocument();

		await user.click(save);

		await waitFor(() => expect(bodies).toEqual([{ amountMinor: 16_500_000 }]));
	});

	it('смена периодичности отправляет только её', async () => {
		const bodies: RecurringPaymentUpdate[] = [];

		apiServer.use(
			handleUpdateRecurringPayment(async ({ request }) => {
				bodies.push((await request.json()) as RecurringPaymentUpdate);

				return HttpResponse.json(byId('p-rent'));
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Изменить: Аренда офиса' })
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Изменить платёж',
		});

		await user.click(
			within(dialog).getByRole('combobox', { name: 'Периодичность' })
		);
		await user.click(
			screen.getByRole('option', { name: `Раз в${nbsp}квартал` })
		);
		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		await waitFor(() => expect(bodies).toEqual([{ periodCount: 3 }]));
	});

	it('число оплат: не меньше оплаченных и просроченных, пустое снимает ограничение', async () => {
		Object.assign(byId('p-rent'), { occurrenceLimit: 4, paidOccurrences: 2 });

		const bodies: RecurringPaymentUpdate[] = [];

		apiServer.use(
			handleUpdateRecurringPayment(async ({ request }) => {
				bodies.push((await request.json()) as RecurringPaymentUpdate);

				return HttpResponse.json(byId('p-rent'));
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Изменить: Аренда офиса' })
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Изменить платёж',
		});
		const limit = within(dialog).getByLabelText('Сколько раз оплатить');
		const save = within(dialog).getByRole('button', { name: 'Сохранить' });

		expect(within(dialog).getByText('Уже оплачено 2')).toBeInTheDocument();

		await user.clear(limit);
		await user.type(limit, '2');
		await user.click(save);

		expect(
			await within(dialog).findByText(
				'Не меньше 3: столько периодов уже оплачено или просрочено'
			)
		).toBeInTheDocument();
		expect(bodies).toEqual([]);

		await user.clear(limit);
		await user.click(save);

		await waitFor(() => expect(bodies).toEqual([{ occurrenceLimit: null }]));
	});

	it('окно напоминаний: больше 30 поле исправляет, пустое возвращает общее', async () => {
		Object.assign(byId('p-rent'), { reminderDaysBefore: 7 });
		// Общее окно приходит с сервера: из настроек панели или REMINDER_DAYS_BEFORE.
		serveSettings({ reminderDaysBefore: 5 });

		const bodies: RecurringPaymentUpdate[] = [];

		apiServer.use(
			handleUpdateRecurringPayment(async ({ request }) => {
				bodies.push((await request.json()) as RecurringPaymentUpdate);

				return HttpResponse.json(byId('p-rent'));
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Изменить: Аренда офиса' })
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Изменить платёж',
		});
		const field = within(dialog).getByLabelText('Напоминать за, дней');
		const save = within(dialog).getByRole('button', { name: 'Сохранить' });

		expect(field).toHaveValue('7');

		await user.clear(field);
		await user.type(field, '45');
		await user.tab();

		expect(field).toHaveValue('30');

		await user.clear(field);

		expect(
			within(dialog).getByText('Пусто: как у всех платежей, за 5 дней до срока')
		).toBeInTheDocument();

		await user.click(save);

		await waitFor(() => expect(bodies).toEqual([{ reminderDaysBefore: null }]));
	});

	it('у якоря 31 называет ближайший короткий месяц', async () => {
		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Изменить: Подписка' })
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Изменить платёж',
		});

		expect(dialog).toHaveTextContent(
			`Срок повторяется 31${nbh}го числа, в коротких месяцах в последний день. Если выбрать 30.11, срок перейдёт на 30${nbh}е число.`
		);
	});

	it('прекращённый на сервере платёж: форма объясняет, почему не сохранилось', async () => {
		apiServer.use(
			handleUpdateRecurringPayment(() =>
				HttpResponse.json(apiErrorBody(409, 'payment_stopped'), {
					status: 409,
				})
			)
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(
			await screen.findByRole('button', { name: 'Изменить: Аренда офиса' })
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Изменить платёж',
		});
		const name = within(dialog).getByLabelText('Название');

		await user.clear(name);
		await user.type(name, 'Аренда склада');
		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		expect(
			await within(dialog).findByText('Платёж прекращён, изменить его нельзя.')
		).toBeInTheDocument();
	});
});

describe('прекращение платежа', () => {
	it('окно называет удаляемый и просроченный периоды, после прекращения карточка помечена', async () => {
		let stopped = 0;

		apiServer.use(
			handleStopRecurringPayment(() => {
				stopped += 1;
				Object.assign(byId('p-rent'), {
					stoppedAt: '2026-10-24T12:00:00Z',
					nextDueDate: null,
				});

				return new HttpResponse(null, { status: 204 });
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments/p-rent');

		const card = await screen.findByRole('dialog', { name: 'Аренда офиса' });

		await user.click(within(card).getByRole('button', { name: 'Прекратить' }));

		const dialog = await screen.findByRole('dialog', {
			name: 'Прекратить платёж?',
		});

		expect(dialog).toHaveTextContent('Аренда офиса, 150 000,00 ₽ ежемесячно');
		expect(dialog).toHaveTextContent(
			'Период 19.11.2026 на 150 000,00 ₽ будет удалён.'
		);
		expect(dialog).toHaveTextContent('Платёж можно будет возобновить.');
		expect(dialog).toHaveTextContent(
			'Просроченный период 19.10.2026 останется в платежах'
		);

		await user.click(
			within(dialog).getByRole('button', { name: 'Прекратить платёж' })
		);

		expect(await within(card).findByText('прекращён')).toBeInTheDocument();
		expect(
			within(card).queryByRole('button', { name: 'Изменить' })
		).not.toBeInTheDocument();
		expect(stopped).toBe(1);
	});
});

describe('возобновление платежа', () => {
	it('по прежнему расписанию: запрос без даты, платёж снова действует', async () => {
		const bodies: string[] = [];

		apiServer.use(
			handleResumeRecurringPayment(async ({ request }) => {
				bodies.push(await request.text());
				Object.assign(byId('p-cloud'), {
					stoppedAt: null,
					nextDueDate: '2026-11-05',
				});

				return HttpResponse.json(byId('p-cloud'));
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments?status=all');

		await user.click(
			await screen.findByRole('button', {
				name: 'Возобновить: Облачное хранилище',
			})
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Возобновить платёж?',
		});

		expect(dialog).toHaveTextContent('Облачное хранилище, 9,99 € ежемесячно');
		expect(
			within(dialog).getByRole('radio', { name: /По прежнему расписанию/ })
		).toBeChecked();

		await user.click(
			within(dialog).getByRole('button', { name: 'Возобновить платёж' })
		);

		expect(
			await screen.findByText(
				'«Облачное хранилище»: ближайший срок 05.11.2026.'
			)
		).toBeInTheDocument();
		expect(bodies).toHaveLength(1);
		expect(bodies[0]).not.toContain('nextDueDate');

		const row = await screen.findByRole('row', { name: /Облачное хранилище/ });

		await waitFor(() => expect(row).not.toHaveTextContent('прекращён'));
		expect(
			within(row).getByRole('button', { name: 'Изменить: Облачное хранилище' })
		).toBeInTheDocument();
	});

	it('с другой даты: дата уходит в запрос, срок в окне напоминания предупреждает', async () => {
		const bodies: unknown[] = [];

		apiServer.use(
			handleResumeRecurringPayment(async ({ request }) => {
				bodies.push(await request.json());

				return HttpResponse.json({
					...byId('p-cloud'),
					stoppedAt: null,
					nextDueDate: '2026-10-26',
				});
			})
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments/p-cloud');

		const card = await screen.findByRole('dialog', {
			name: 'Облачное хранилище',
		});

		expect(
			within(card).queryByRole('button', { name: 'Изменить' })
		).not.toBeInTheDocument();

		await user.click(within(card).getByRole('button', { name: 'Возобновить' }));

		const dialog = await screen.findByRole('dialog', {
			name: 'Возобновить платёж?',
		});

		await user.click(
			within(dialog).getByRole('radio', { name: 'С другой даты' })
		);
		await user.click(
			within(dialog).getByRole('button', { name: 'Возобновить платёж' })
		);

		expect(
			await within(dialog).findByText('Выберите дату ближайшей оплаты')
		).toBeInTheDocument();
		expect(bodies).toEqual([]);

		await pickDay(user, dialog, '26 октября 2026');

		expect(dialog).toHaveTextContent(
			'Срок через 2 дня. Напоминание отправится в подключённые чаты сразу после возобновления.'
		);

		await user.click(
			within(dialog).getByRole('button', { name: 'Возобновить платёж' })
		);

		await waitFor(() =>
			expect(bodies).toEqual([{ nextDueDate: '2026-10-26' }])
		);
	});

	it('уже действующий платёж: окно закрывается', async () => {
		apiServer.use(
			handleResumeRecurringPayment(() =>
				HttpResponse.json(apiErrorBody(409, 'payment_active'), { status: 409 })
			)
		);

		const user = userEvent.setup();

		renderApp('/recurring-payments?status=stopped');

		await user.click(
			await screen.findByRole('button', {
				name: 'Возобновить: Облачное хранилище',
			})
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Возобновить платёж?',
		});

		await user.click(
			within(dialog).getByRole('button', { name: 'Возобновить платёж' })
		);

		await waitFor(() =>
			expect(
				screen.queryByRole('dialog', { name: 'Возобновить платёж?' })
			).not.toBeInTheDocument()
		);
	});
});

describe('регулярные платежи на телефоне', () => {
	it('нажатие на платёж открывает карточку во весь экран', async () => {
		stubMatchMedia({ width: 390 });

		const user = userEvent.setup();

		renderApp('/recurring-payments');

		await user.click(await screen.findByRole('link', { name: /Аренда офиса/ }));

		const card = await screen.findByRole('dialog', { name: 'Аренда офиса' });

		expect(
			within(card).getByRole('button', { name: 'Назад к списку' })
		).toBeInTheDocument();
		expect(
			await within(card).findByText(`Просрочено 5${nbsp}дн.`, {
				normalizer: (text) => text,
			})
		).toBeInTheDocument();
	});
});
