import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
	CurrencyTotals,
	PaymentOccurrence,
	PlannedOccurrence,
} from '@shared/api';
import {
	apiServer,
	currencyTotals,
	handleGetPaymentsForecast,
	handleGetPaymentsSummary,
	handleListPaymentOccurrences,
	handleUpdatePaymentOccurrence,
	servePaymentsScreen,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';

import { renderApp } from './test-router';

// Доступные имена сохраняют неразрывные пробелы, getByText сводит их к обычным.
const nbsp = '\u00a0';

function occurrence(overrides: Partial<PaymentOccurrence>): PaymentOccurrence {
	return {
		id: 'o-rent-11',
		recurringPayment: { id: 'p-rent', name: 'Аренда офиса', stopped: false },
		department: { id: 'd-office', name: 'Офис' },
		dueDate: '2026-11-19',
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

const rent = occurrence({});
const serverOctober = occurrence({
	id: 'o-server-10',
	recurringPayment: { id: 'p-server', name: 'Сервер', stopped: false },
	department: { id: 'd-it', name: 'ИТ' },
	dueDate: '2026-10-26',
	amountMinor: 2500,
	currency: 'USD',
});
const serverPlanned: PlannedOccurrence = {
	recurringPayment: { id: 'p-server', name: 'Сервер', stopped: false },
	department: { id: 'd-it', name: 'ИТ' },
	dueDate: '2026-11-26',
	amountMinor: 2500,
	currency: 'USD',
};

/** Периоды и плановые периоды календаря; возвращает число запросов прогноза. */
function serveCalendar(
	created: PaymentOccurrence[],
	planned: PlannedOccurrence[]
) {
	const forecast: URLSearchParams[] = [];

	apiServer.use(
		handleListPaymentOccurrences(() =>
			HttpResponse.json({ items: created, total: created.length })
		),
		handleGetPaymentsForecast(({ request }) => {
			forecast.push(new URL(request.url).searchParams);

			return HttpResponse.json({ items: planned, total: planned.length });
		})
	);

	return forecast;
}

beforeEach(() => {
	stubMatchMedia({ width: 1440 });
	signIn('admin');
	servePaymentsScreen();
});

describe('переключатель видов', () => {
	it('календарь сохраняет период, бюджет листает годы, таблица убирает вид и год', async () => {
		serveCalendar([rent], []);

		const user = userEvent.setup();
		const { router } = renderApp('/payments?from=2026-11-01&to=2026-11-30');

		await user.click(await screen.findByRole('radio', { name: 'Календарь' }));

		expect(router.state.location.search).toEqual({
			from: '2026-11-01',
			to: '2026-11-30',
			view: 'calendar',
		});

		await user.click(screen.getByRole('radio', { name: 'Бюджет' }));
		await user.click(
			await screen.findByRole('button', { name: 'Следующий год' })
		);

		expect(router.state.location.search).toEqual({
			from: '2026-11-01',
			to: '2026-11-30',
			view: 'budget',
			year: 2027,
		});

		await user.click(screen.getByRole('radio', { name: 'Таблица' }));

		expect(router.state.location.search).toEqual({
			from: '2026-11-01',
			to: '2026-11-30',
		});
	});
});

describe('календарь', () => {
	it('периоды в днях, плановые пунктиром, число периодов', async () => {
		serveCalendar([rent], [serverPlanned]);
		renderApp('/payments?view=calendar&from=2026-11-01&to=2026-11-30');

		expect(
			await screen.findByRole('button', {
				name: `Аренда офиса, 150${nbsp}000${nbsp}₽`,
			})
		).toBeInTheDocument();
		expect(
			await screen.findByRole('button', {
				name: `Сервер, 25${nbsp}$, по${nbsp}расписанию`,
			})
		).toBeInTheDocument();
		expect(
			screen.getByText('2 периода за ноябрь, из них 1 по расписанию')
		).toBeInTheDocument();
	});

	it('при статусе «Оплачено» плановые не запрашиваются', async () => {
		const forecast = serveCalendar([], [serverPlanned]);

		renderApp(
			'/payments?view=calendar&status=paid&from=2026-11-01&to=2026-11-30'
		);

		expect(await screen.findByText(/0 периодов за ноябрь/)).toBeInTheDocument();
		expect(forecast).toHaveLength(0);
	});

	it('карточка: отметка оплаты и пояснение планового периода', async () => {
		const bodies: unknown[] = [];

		serveCalendar([serverOctober, rent], [serverPlanned]);
		apiServer.use(
			handleUpdatePaymentOccurrence(async ({ request }) => {
				bodies.push(await request.json());

				return HttpResponse.json({
					...rent,
					paid: true,
					paidOn: '2026-10-24',
				});
			})
		);

		const user = userEvent.setup();

		renderApp('/payments?view=calendar&from=2026-10-01&to=2026-11-30');

		await user.click(
			await screen.findByRole('button', {
				name: `Сервер, 25${nbsp}$, по${nbsp}расписанию`,
			})
		);

		const planned = await screen.findByRole('dialog', { name: /^Сервер/ });

		expect(planned).toHaveTextContent(
			'Период появится 26.10.2026, в день срока предыдущего.'
		);
		expect(
			within(planned).queryByRole('button', { name: 'Оплачено' })
		).not.toBeInTheDocument();

		await user.click(
			screen.getByRole('button', {
				name: `Аренда офиса, 150${nbsp}000${nbsp}₽`,
			})
		);

		const card = await screen.findByRole('dialog', { name: /^Аренда офиса/ });

		await user.click(within(card).getByRole('button', { name: 'Оплачено' }));

		await waitFor(() => expect(bodies).toEqual([{ paid: true }]));
	});

	it('на телефоне день показывает свои периоды', async () => {
		stubMatchMedia({ width: 390 });
		serveCalendar([rent], [serverPlanned]);

		const user = userEvent.setup();

		renderApp('/payments?view=calendar&from=2026-11-01&to=2026-11-30');

		await user.click(
			await screen.findByRole('button', {
				name: `19${nbsp}ноября: 1${nbsp}платёж`,
			})
		);

		expect(await screen.findByText('Аренда офиса')).toBeInTheDocument();

		await user.click(
			screen.getByRole('button', { name: `26${nbsp}ноября: 1${nbsp}платёж` })
		);

		expect(
			await screen.findByText(/Период появится в день срока предыдущего\./)
		).toBeInTheDocument();
	});
});

function totals(
	currency: CurrencyTotals['currency'],
	values: Partial<CurrencyTotals>
) {
	return currencyTotals({ currency, ...values });
}

/** Итоги года по месяцам: сентябрь с просрочкой, ноябрь по расписанию. */
function serveBudget() {
	const months = Array.from({ length: 12 }, (_, index) => {
		const month = `2026-${String(index + 1).padStart(2, '0')}`;
		const rub =
			month === '2026-09'
				? totals('RUB', {
						totalMinor: 30_000_000,
						paidMinor: 15_000_000,
						unpaidMinor: 15_000_000,
						overdueMinor: 15_000_000,
						count: 3,
						paidCount: 2,
						overdueCount: 1,
						unpaidCount: 1,
					})
				: month === '2026-11'
					? totals('RUB', { plannedMinor: 15_000_000, plannedCount: 1 })
					: totals('RUB', {});

		return {
			month,
			currencies: [
				rub,
				totals(
					'USD',
					month === '2026-11' ? { plannedMinor: 2500, plannedCount: 1 } : {}
				),
				totals('EUR', {}),
			],
		};
	});

	apiServer.use(
		handleGetPaymentsSummary(({ request }) => {
			const params = new URL(request.url).searchParams;

			return HttpResponse.json({
				from: params.get('from'),
				to: params.get('to'),
				departmentId: null,
				months: params.get('groupBy') === 'month' ? months : null,
				currencies: [
					totals('RUB', {
						totalMinor: 30_000_000,
						paidMinor: 15_000_000,
						unpaidMinor: 15_000_000,
						overdueMinor: 15_000_000,
						plannedMinor: 15_000_000,
						count: 3,
						paidCount: 2,
						overdueCount: 1,
						plannedCount: 1,
					}),
					totals('USD', { plannedMinor: 2500, plannedCount: 1 }),
					totals('EUR', {}),
				],
			});
		})
	);
}

describe('бюджет', () => {
	it('план по валютам, месяцы и переход к месяцу', async () => {
		serveBudget();

		const user = userEvent.setup();
		const { router } = renderApp('/payments?view=budget');

		const rub = await screen.findByRole('region', {
			name: 'План в рублях на 2026 год',
		});

		expect(rub).toHaveTextContent('450 000,00');
		expect(rub).toHaveTextContent('Просрочено 150 000,00');
		expect(
			screen.getByRole('region', { name: 'План в евро на 2026 год' })
		).toHaveTextContent('Нет периодов за 2026 год');

		const september = screen.getByRole('row', { name: /Сентябрь/ });

		expect(september).toHaveTextContent('3: оплачено 2, просрочен 1');
		expect(screen.getByRole('row', { name: /Октябрь/ })).toHaveTextContent(
			'текущий'
		);
		expect(screen.getByRole('row', { name: /Ноябрь/ })).toHaveTextContent(
			'2 по расписанию'
		);

		await user.click(
			screen.getByRole('link', { name: 'Ноябрь: открыть периоды месяца' })
		);

		await waitFor(() =>
			expect(router.state.location.search).toEqual({
				from: '2026-11-01',
				to: '2026-11-30',
			})
		);
	});

	it('на телефоне валюта переключает карточку и месяцы', async () => {
		stubMatchMedia({ width: 390 });
		serveBudget();

		const user = userEvent.setup();

		renderApp('/payments?view=budget');

		expect(
			await screen.findByRole('region', { name: 'План в рублях на 2026 год' })
		).toBeInTheDocument();

		await user.click(screen.getByRole('radio', { name: 'USD' }));

		expect(
			await screen.findByRole('region', { name: 'План в долларах на 2026 год' })
		).toHaveTextContent('25,00');
		expect(
			screen.getByText(/С января по октябрь периодов нет/)
		).toBeInTheDocument();
	});
});

const internet = occurrence({
	id: 'o-net-11',
	recurringPayment: { id: 'p-net', name: 'Интернет в офисе', stopped: false },
	department: null,
	dueDate: '2026-11-20',
	amountMinor: 490_000,
});

/** Таблица: созданные и плановые периоды; запоминает запросы прогноза и итогов. */
function serveTable(
	created: PaymentOccurrence[],
	planned: PlannedOccurrence[]
) {
	const forecast = serveCalendar(created, planned);
	const summaries: URLSearchParams[] = [];

	apiServer.use(
		handleGetPaymentsSummary(({ request }) => {
			summaries.push(new URL(request.url).searchParams);

			return HttpResponse.json({
				from: null,
				to: null,
				departmentId: null,
				currencies: [
					totals('RUB', {}),
					totals('USD', { plannedMinor: 2500, plannedCount: 1 }),
					totals('EUR', {}),
				],
			});
		})
	);

	return { forecast, summaries };
}

describe('плановые периоды в таблице', () => {
	it('встают по сроку, без действий, с датой появления; итоги с плановыми', async () => {
		const { summaries } = serveTable(
			[serverOctober, rent, internet],
			[serverPlanned]
		);

		renderApp('/payments');

		const server = await screen.findByRole('row', {
			name: /Сервер.*26\.11\.2026/,
		});

		expect(server).toHaveTextContent('По расписанию');
		expect(server).toHaveTextContent('появится 26.10.2026');
		expect(within(server).queryByRole('button')).not.toBeInTheDocument();

		const names = screen
			.getAllByRole('row')
			.map((row) => row.textContent ?? '');

		expect(names.findIndex((text) => text.includes('Интернет'))).toBeLessThan(
			names.findIndex((text) => text.includes('26.11.2026'))
		);
		expect(screen.getByText(/ещё 1 по расписанию/)).toBeInTheDocument();
		expect(summaries[0]?.get('includePlanned')).toBe('true');
		expect(screen.getByRole('region', { name: 'Итоги USD' })).toHaveTextContent(
			'1 период по расписанию'
		);
	});

	it('при статусе «Оплачено» плановые не запрашиваются', async () => {
		const { forecast } = serveTable(
			[{ ...rent, paid: true, paidOn: '2026-10-24' }],
			[serverPlanned]
		);

		renderApp('/payments?status=paid');

		expect(
			await screen.findByRole('row', { name: /Аренда офиса/ })
		).toBeInTheDocument();
		expect(
			screen.queryByRole('row', { name: /Сервер/ })
		).not.toBeInTheDocument();
		expect(forecast).toHaveLength(0);
	});

	it('без созданных периодов видны плановые вместо пустого состояния', async () => {
		serveTable([], [serverPlanned]);

		renderApp('/payments');

		expect(
			await screen.findByRole('row', { name: /Сервер/ })
		).toHaveTextContent('По расписанию');
		expect(screen.queryByText('Ничего не нашлось')).not.toBeInTheDocument();
	});

	it('на телефоне плановая карточка без отметки оплаты', async () => {
		stubMatchMedia({ width: 390 });
		serveTable([rent], [serverPlanned]);

		renderApp('/payments');

		const card = await screen.findByRole('region', {
			name: `Сервер, срок 26.11.2026, по${nbsp}расписанию`,
		});

		expect(card).toHaveTextContent('По расписанию');
		expect(within(card).queryByRole('button')).not.toBeInTheDocument();
	});
});
