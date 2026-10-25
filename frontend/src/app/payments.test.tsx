import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaymentOccurrence, RecurringPayment } from '@shared/api';
import {
	apiErrorBody,
	apiServer,
	currencyTotals,
	handleCreateRecurringPayment,
	handleGetPaymentsSummary,
	handleGetRecurringPayment,
	handleListPaymentOccurrences,
	handleUpdatePaymentOccurrence,
	servePaymentsScreen,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';

import { renderApp } from './test-router';

// getByText сводит неразрывные пробелы к обычным, доступные имена - нет.
const nbsp = '\u00a0';
// «19-го» набирается неразрывным дефисом.
const nbh = '\u2011';

function occurrence(overrides: Partial<PaymentOccurrence>): PaymentOccurrence {
	return {
		id: 'o-rent',
		recurringPayment: { id: 'p-rent', name: 'Аренда офиса', stopped: false },
		department: { id: 'd-office', name: 'Офис' },
		dueDate: '2026-10-19',
		amountMinor: 15_000_000,
		currency: 'RUB',
		paid: false,
		paidOn: null,
		paidByLogin: null,
		overdue: true,
		daysOverdue: 5,
		...overrides,
	};
}

const rent = occurrence({});
const recurringPayment: RecurringPayment = {
	id: 'p-server',
	name: 'Сервер',
	amountMinor: 2_500,
	currency: 'RUB',
	period: 'month',
	periodCount: 1,
	occurrenceLimit: null,
	reminderDaysBefore: null,
	paidOccurrences: 0,
	completed: false,
	anchorDay: 30,
	nextDueDate: '2026-10-30',
	overdueCount: 0,
	oldestOverdueDays: null,
	department: null,
	stoppedAt: null,
	createdAt: '2026-10-24T09:00:00Z',
	createdByLogin: 'a.smirnov@company.ru',
};
const internet = occurrence({
	id: 'o-internet',
	recurringPayment: {
		id: 'p-internet',
		name: 'Интернет в офисе',
		stopped: false,
	},
	department: null,
	dueDate: '2026-10-20',
	amountMinor: 490_000,
	paid: true,
	paidOn: '2026-10-22',
	paidByLogin: 'buh.petrova@company.ru',
	overdue: true,
	daysOverdue: 2,
});

/** Запросы списка периодов: параметры каждого. */
function captureList(
	respond: (params: URLSearchParams) => PaymentOccurrence[]
) {
	const requests: URLSearchParams[] = [];

	apiServer.use(
		handleListPaymentOccurrences(({ request }) => {
			const params = new URL(request.url).searchParams;
			const items = respond(params);

			requests.push(params);

			return HttpResponse.json({ items, total: items.length });
		})
	);

	return requests;
}

beforeEach(() => {
	stubMatchMedia({ width: 1440 });
	signIn('user');
	servePaymentsScreen();
});

describe('список и итоги', () => {
	it('по умолчанию показаны этот и следующий месяц от сегодня сервера', async () => {
		const summaries: URLSearchParams[] = [];
		const requests = captureList(() => [rent]);

		apiServer.use(
			handleGetPaymentsSummary(({ request }) => {
				summaries.push(new URL(request.url).searchParams);

				return HttpResponse.json({
					from: null,
					to: null,
					departmentId: null,
					currencies: [
						currencyTotals({
							currency: 'RUB',
							totalMinor: 15_490_000,
							unpaidMinor: 15_000_000,
							overdueMinor: 15_000_000,
							paidMinor: 490_000,
							count: 2,
						}),
					],
				});
			})
		);

		renderApp('/payments');

		expect(
			await screen.findByRole('button', {
				name: `Период: Октябрь и${nbsp}ноябрь 2026`,
			})
		).toBeInTheDocument();
		const row = await screen.findByRole('row', { name: /Аренда офиса/ });

		expect(within(row).getByText('Просрочено')).toBeInTheDocument();
		expect(within(row).getByText('5 дн.')).toBeInTheDocument();
		expect(screen.getByLabelText('Итоги RUB')).toHaveTextContent(
			/К оплате\s*150 000,00 ₽/
		);
		expect(requests[0]?.get('from')).toBe('2026-10-01');
		expect(requests[0]?.get('to')).toBe('2026-11-30');
		expect(summaries[0]?.get('from')).toBe('2026-10-01');
	});

	it('отдел и статус попадают в адрес и в запрос списка, а итоги - без статуса', async () => {
		const summaries: URLSearchParams[] = [];

		servePaymentsScreen({
			departments: [{ id: 'd-it', name: 'ИТ', paymentsCount: 1 }],
		});

		const requests = captureList(() => [rent]);

		apiServer.use(
			handleGetPaymentsSummary(({ request }) => {
				summaries.push(new URL(request.url).searchParams);

				return HttpResponse.json({
					from: null,
					to: null,
					departmentId: null,
					currencies: [],
				});
			})
		);

		const user = userEvent.setup();
		const { router } = renderApp('/payments');

		await user.click(await screen.findByRole('combobox', { name: 'Отдел' }));
		await user.click(screen.getByRole('option', { name: 'ИТ' }));
		await user.click(screen.getByRole('radio', { name: 'Просрочено' }));

		await vi.waitFor(() =>
			expect(requests.at(-1)?.get('status')).toBe('overdue')
		);
		expect(requests.at(-1)?.get('departmentId')).toBe('d-it');
		expect(summaries.at(-1)?.get('departmentId')).toBe('d-it');
		expect(summaries.every((params) => !params.has('status'))).toBe(true);
		expect(router.state.location.search).toMatchObject({
			dept: 'd-it',
			status: 'overdue',
		});
	});

	it('«Без отдела» запрашивает платежи без отдела', async () => {
		const requests = captureList(() => [internet]);
		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(await screen.findByRole('combobox', { name: 'Отдел' }));
		await user.click(screen.getByRole('option', { name: 'Без отдела' }));

		await vi.waitFor(() =>
			expect(requests.at(-1)?.get('departmentId')).toBe('none')
		);
	});

	it('«На дату» запрашивает все периоды по выбранную дату', async () => {
		const requests = captureList(() => [rent]);
		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(await screen.findByRole('button', { name: /^Период:/ }));
		await user.click(screen.getByRole('radio', { name: 'На дату' }));
		await user.click(screen.getByRole('button', { name: 'Конец следующего' }));

		expect(
			await screen.findByRole('button', { name: `Период: По${nbsp}30.11.2026` })
		).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(requests.at(-1)?.get('to')).toBe('2026-11-30')
		);
		expect(requests.at(-1)?.has('from')).toBe(false);
	});

	it('при ошибке загрузки видно сообщение, «Повторить» загружает список', async () => {
		let fail = true;

		apiServer.use(
			handleListPaymentOccurrences(() =>
				fail
					? HttpResponse.json(apiErrorBody(500, 'internal'), { status: 500 })
					: HttpResponse.json({ items: [rent], total: 1 })
			)
		);

		const user = userEvent.setup();

		renderApp('/payments');

		expect(
			await screen.findByText('Не удалось загрузить платежи')
		).toBeInTheDocument();

		fail = false;
		await user.click(screen.getByRole('button', { name: 'Повторить' }));

		expect(await screen.findByText('Аренда офиса')).toBeInTheDocument();
	});

	it('пустой фильтр объясняет причину, «Сбросить фильтры» возвращает фильтры по умолчанию', async () => {
		captureList((params) => (params.get('limit') === '1' ? [rent] : []));

		const user = userEvent.setup();
		const { router } = renderApp('/payments?currency=USD&dept=none');

		expect(await screen.findByText('Ничего не нашлось')).toBeInTheDocument();

		await user.click(
			within(screen.getByLabelText('Периоды')).getAllByRole('button', {
				name: 'Сбросить фильтры',
			})[0] as HTMLElement
		);

		expect(router.state.location.search).toEqual({});
	});

	it('пользователь без единого периода видит, что платежи добавляет администратор', async () => {
		renderApp('/payments');

		expect(
			await screen.findByText(/Регулярные платежи добавляет администратор/)
		).toBeInTheDocument();
	});

	it('строка о прошлой просрочке показывает число и суммы, «Показать» расширяет период', async () => {
		const subscription = occurrence({
			id: 'o-sub',
			recurringPayment: { id: 'p-sub', name: 'Подписка', stopped: false },
			dueDate: '2026-09-30',
			amountMinor: 1_299,
			currency: 'EUR',
			daysOverdue: 24,
		});

		captureList((params) =>
			params.get('status') === 'overdue' && params.get('to') === '2026-09-30'
				? [subscription]
				: [rent]
		);
		apiServer.use(
			handleGetPaymentsSummary(({ request }) => {
				const to = new URL(request.url).searchParams.get('to');

				return HttpResponse.json({
					from: null,
					to,
					departmentId: null,
					currencies:
						to === '2026-09-30'
							? [
									currencyTotals({
										currency: 'EUR',
										overdueMinor: 1_299,
										unpaidMinor: 1_299,
										totalMinor: 1_299,
										count: 1,
									}),
								]
							: [],
				});
			})
		);

		const user = userEvent.setup();
		const { router } = renderApp('/payments');

		expect(
			await screen.findByText(
				'Ещё 1 просроченный период раньше октября: 12,99 €'
			)
		).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Показать' }));

		expect(router.state.location.search).toMatchObject({
			from: '2026-09-01',
			to: '2026-11-30',
		});
	});

	it('страницы списка: вторая страница запрашивает следующие периоды', async () => {
		const requests: URLSearchParams[] = [];

		apiServer.use(
			handleListPaymentOccurrences(({ request }) => {
				requests.push(new URL(request.url).searchParams);

				return HttpResponse.json({ items: [rent], total: 60 });
			})
		);

		const user = userEvent.setup();
		const { router } = renderApp('/payments');

		await user.click(await screen.findByRole('button', { name: 'Страница 2' }));

		await vi.waitFor(() => expect(requests.at(-1)?.get('offset')).toBe('50'));
		expect(router.state.location.search).toMatchObject({ page: 2 });
	});
});

describe('действия с периодом', () => {
	it('«Оплачено» отмечает период сегодняшней датой', async () => {
		const bodies: unknown[] = [];
		let current = rent;

		captureList(() => [current]);
		apiServer.use(
			handleUpdatePaymentOccurrence(async ({ request }) => {
				bodies.push(await request.json());
				current = {
					...rent,
					paid: true,
					paidOn: '2026-10-24',
					paidByLogin: 'buh.petrova@company.ru',
				};

				return HttpResponse.json(current);
			})
		);

		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(
			await screen.findByRole('button', {
				name: 'Оплачено: Аренда офиса, срок 19.10.2026',
			})
		);

		expect(
			await screen.findByText('Оплачено с опозданием')
		).toBeInTheDocument();
		expect(bodies).toEqual([{ paid: true }]);
	});

	it('пока отметка сохраняется, повторное нажатие не отправляет второй запрос', async () => {
		let calls = 0;

		captureList(() => [rent]);
		apiServer.use(
			handleUpdatePaymentOccurrence(async () => {
				calls += 1;
				await delay('infinite');

				return HttpResponse.json(rent);
			})
		);

		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(
			await screen.findByRole('button', { name: /^Оплачено: Аренда/ })
		);

		const saving = await screen.findByRole('button', { name: /Сохраняем/ });

		expect(saving).toBeDisabled();
		expect(calls).toBe(1);
	});

	it('ошибка сохранения видна, период остаётся неоплаченным', async () => {
		captureList(() => [rent]);
		apiServer.use(
			handleUpdatePaymentOccurrence(() =>
				HttpResponse.json(apiErrorBody(500, 'internal'), { status: 500 })
			)
		);

		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(
			await screen.findByRole('button', { name: /^Оплачено: Аренда/ })
		);

		expect(await screen.findByText('Не удалось сохранить')).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: /^Оплачено: Аренда/ })
		).toBeInTheDocument();
	});

	it('исправление даты отправляет новую дату и убирает просрочку', async () => {
		const bodies: unknown[] = [];
		let current = internet;

		captureList(() => [current]);
		apiServer.use(
			handleUpdatePaymentOccurrence(async ({ request }) => {
				bodies.push(await request.json());
				current = {
					...internet,
					paidOn: '2026-10-20',
					overdue: false,
					daysOverdue: 0,
				};

				return HttpResponse.json(current);
			})
		);

		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(
			await screen.findByRole('button', {
				name: 'Действия: Интернет в офисе, срок 20.10.2026',
			})
		);
		await user.click(screen.getByRole('menuitem', { name: 'Исправить дату' }));

		const dialog = await screen.findByRole('dialog', {
			name: 'Исправить дату',
		});

		expect(
			within(dialog).getByRole('button', { name: '25 октября 2026' })
		).toBeDisabled();

		await user.click(
			within(dialog).getByRole('button', { name: '20 октября 2026' })
		);
		expect(
			within(dialog).getByText('Оплачено 20.10.2026, без просрочки')
		).toBeInTheDocument();
		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		const row = await screen.findByRole('row', { name: /Интернет в офисе/ });

		expect(await within(row).findByText('Оплачено')).toBeInTheDocument();
		expect(bodies).toEqual([{ paid: true, paidOn: '2026-10-20' }]);
	});

	it('ошибка сервера по дате оплаты видна в окне', async () => {
		captureList(() => [internet]);
		apiServer.use(
			handleUpdatePaymentOccurrence(() =>
				HttpResponse.json(
					{
						...apiErrorBody(400, 'bad_request'),
						payload: [
							{
								field: 'paidOn',
								message: 'Дата оплаты не может быть позже сегодняшней',
							},
						],
					},
					{ status: 400 }
				)
			)
		);

		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(
			await screen.findByRole('button', { name: /^Действия: Интернет/ })
		);
		await user.click(screen.getByRole('menuitem', { name: 'Исправить дату' }));

		const dialog = await screen.findByRole('dialog', {
			name: 'Исправить дату',
		});

		await user.click(
			within(dialog).getByRole('button', { name: '21 октября 2026' })
		);
		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		expect(
			await within(dialog).findByText(
				'Дата оплаты не может быть позже сегодняшней'
			)
		).toBeInTheDocument();
	});

	it('отмена оплаты без подтверждения, «Вернуть» восстанавливает прежнюю дату', async () => {
		const bodies: unknown[] = [];

		captureList(() => [internet]);
		apiServer.use(
			handleUpdatePaymentOccurrence(async ({ request }) => {
				bodies.push(await request.json());

				return HttpResponse.json(internet);
			})
		);

		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(
			await screen.findByRole('button', { name: /^Действия: Интернет/ })
		);
		await user.click(screen.getByRole('menuitem', { name: 'Отменить оплату' }));

		expect(await screen.findByText('Оплата отменена')).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Вернуть' }));

		await vi.waitFor(() =>
			expect(bodies).toEqual([
				{ paid: false },
				{ paid: true, paidOn: '2026-10-22' },
			])
		);
	});
});

describe('платёж по прямой ссылке', () => {
	const rentPayment: RecurringPayment = {
		...recurringPayment,
		id: 'p-rent',
		name: 'Аренда офиса',
		amountMinor: 15_000_000,
		anchorDay: 19,
		nextDueDate: '2026-11-19',
		overdueCount: 1,
		oldestOverdueDays: 5,
		department: { id: 'd-office', name: 'Офис' },
	};
	const rentNovember = occurrence({
		id: 'o-rent-nov',
		dueDate: '2026-11-19',
		overdue: false,
		daysOverdue: 0,
	});

	/** Сервер: платёж аренды и его периоды; на экране - только просроченный период. */
	function serveRent() {
		let october = rent;

		apiServer.use(
			handleGetRecurringPayment(({ params }) =>
				params.payment_id === 'p-rent'
					? HttpResponse.json(rentPayment)
					: HttpResponse.json(apiErrorBody(404, 'not_found'), { status: 404 })
			),
			handleUpdatePaymentOccurrence(() => {
				october = {
					...rent,
					paid: true,
					paidOn: '2026-10-24',
					paidByLogin: 'buh.petrova@company.ru',
				};

				return HttpResponse.json(october);
			})
		);

		return captureList((params) =>
			params.get('recurringPaymentId') === 'p-rent'
				? [rentNovember, october]
				: [october]
		);
	}

	it('пользователь видит периоды платежа и отмечает оплату из окна', async () => {
		const requests = serveRent();
		const user = userEvent.setup();
		const { router } = renderApp('/payments?status=overdue&payment=p-rent');

		const dialog = await screen.findByRole('dialog', { name: 'Аренда офиса' });

		expect(
			await within(dialog).findByText(
				`150 000,00 ₽ · ежемесячно, 19${nbh}го числа · Офис`
			)
		).toBeInTheDocument();
		expect(within(dialog).getByText('просрочено 5 дн.')).toBeVisible();
		expect(
			within(dialog).queryByRole('link', { name: 'Карточка платежа' })
		).not.toBeInTheDocument();
		expect(
			requests.find((params) => params.get('recurringPaymentId'))?.get('limit')
		).toBe('12');

		await user.click(
			within(dialog).getByRole('button', {
				name: 'Оплачено: Аренда офиса, срок 19.10.2026',
			})
		);

		expect(
			await within(dialog).findByText('Оплачено с опозданием')
		).toBeInTheDocument();
		expect(
			within(dialog).getByRole('button', {
				name: 'Оплачено: Аренда офиса, срок 19.11.2026',
			})
		).toBeInTheDocument();

		await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }));

		await waitFor(() =>
			expect(router.state.location.search).toEqual({ status: 'overdue' })
		);
	});

	it('администратору окно даёт ссылку на карточку платежа', async () => {
		signIn('admin');
		serveRent();
		renderApp('/payments?payment=p-rent');

		const dialog = await screen.findByRole('dialog', { name: 'Аренда офиса' });

		expect(
			await within(dialog).findByRole('link', { name: 'Карточка платежа' })
		).toHaveAttribute('href', '/recurring-payments/p-rent');
	});

	it('неизвестный платёж: окно говорит, что его нет', async () => {
		serveRent();
		renderApp('/payments?payment=p-unknown');

		const dialog = await screen.findByRole('dialog', {
			name: 'Платёж не найден',
		});

		expect(within(dialog).getByText(/Такого платежа нет/)).toBeInTheDocument();
	});
});

describe('добавление платежа', () => {
	it('администратор добавляет платёж с экрана, список перечитывается', async () => {
		signIn('admin');

		const requests = captureList(() => [rent]);
		let created = false;

		apiServer.use(
			handleCreateRecurringPayment(() => {
				created = true;

				return HttpResponse.json(recurringPayment, { status: 201 });
			})
		);

		const user = userEvent.setup();

		renderApp('/payments');

		await screen.findByRole('row', { name: /Аренда офиса/ });
		await user.click(screen.getByRole('button', { name: 'Добавить платёж' }));

		const dialog = await screen.findByRole('dialog', { name: 'Новый платёж' });

		await user.type(within(dialog).getByLabelText('Название'), 'Сервер');
		await user.type(within(dialog).getByLabelText('Сумма'), '25');
		await user.click(within(dialog).getByLabelText('Дата ближайшей оплаты'));
		await user.click(
			within(dialog).getByRole('button', { name: '30 октября 2026' })
		);

		const before = requests.length;

		await user.click(
			within(dialog).getByRole('button', { name: 'Добавить платёж' })
		);

		await waitFor(() =>
			expect(
				screen.queryByRole('dialog', { name: 'Новый платёж' })
			).not.toBeInTheDocument()
		);
		expect(created).toBe(true);
		await waitFor(() => expect(requests.length).toBeGreaterThan(before));
	});

	it('пустой экран администратора предлагает добавить платёж', async () => {
		signIn('admin');

		renderApp('/payments');

		const empty = await screen.findByText(/Добавьте регулярный платёж/);

		expect(
			within(empty.parentElement as HTMLElement).getByRole('button', {
				name: 'Добавить платёж',
			})
		).toBeInTheDocument();
	});

	it('у пользователя кнопки нет', async () => {
		captureList(() => [rent]);

		renderApp('/payments');

		await screen.findByRole('row', { name: /Аренда офиса/ });
		expect(
			screen.queryByRole('button', { name: 'Добавить платёж' })
		).not.toBeInTheDocument();
	});
});

describe('телефон', () => {
	beforeEach(() => {
		stubMatchMedia({ width: 390 });
	});

	it('карточка отмечает оплату, «Показать ещё» догружает следующие периоды', async () => {
		const offsets: (string | null)[] = [];
		const bodies: unknown[] = [];

		apiServer.use(
			handleListPaymentOccurrences(({ request }) => {
				const params = new URL(request.url).searchParams;

				offsets.push(params.get('offset'));

				return HttpResponse.json({
					items: [
						params.get('offset') === '1' ? { ...internet, id: 'o-more' } : rent,
					],
					total: 21,
				});
			}),
			handleUpdatePaymentOccurrence(async ({ request }) => {
				bodies.push(await request.json());

				return HttpResponse.json({ ...rent, paid: true, paidOn: '2026-10-24' });
			})
		);

		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(
			await screen.findByRole('button', {
				name: 'Оплачено: Аренда офиса, срок 19.10.2026',
			})
		);
		await vi.waitFor(() => expect(bodies).toEqual([{ paid: true }]));

		await user.click(screen.getByRole('button', { name: 'Показать ещё' }));

		// Следующая страница начинается после уже загруженных периодов.
		await vi.waitFor(() => expect(offsets).toContain('1'));
	});
});
