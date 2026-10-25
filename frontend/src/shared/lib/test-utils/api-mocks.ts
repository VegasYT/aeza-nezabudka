import { HttpResponse } from 'msw';

import type {
	CurrencyTotals,
	Department,
	PaymentOccurrence,
	RecurringPayment,
	Role,
} from '@shared/api';
import {
	handleExchangeChallenge,
	handleGetCurrentUser,
	handleGetPaymentsForecast,
	handleGetPaymentsSummary,
	handleGetRecurringPayment,
	handleGetSettings,
	handleListDepartments,
	handleListPaymentOccurrences,
	handleListRecurringPayments,
	handleLogin,
	handleSubmitTotp,
} from '@shared/api/generated/msw.gen';

import { apiServer } from './api-server';

/** Обработчики MSW для каждой операции контракта: `handleGetCurrentUser`, `handleLogin` и другие. */
export * from '@shared/api/generated/msw.gen';

/** Email тестового участника с ролью `role`. */
export function accountEmail(role: Role) {
	return {
		admin: 'a.smirnov@company.ru',
		user: 'buh.petrova@company.ru',
		integration: 'erp@company.ru',
	}[role];
}

/** Момент через `hours` часов (отрицательное - в прошлом) в формате API. */
export function hoursFromNow(hours: number) {
	return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/** Тело ошибки API в формате Aéza v2 с кодом `error`. */
export function apiErrorBody(status: number, error: string) {
	return {
		statusCode: status,
		message: 'Ошибка запроса',
		error,
		timestamp: '2026-10-24T14:00:00Z',
		path: '/api/v1',
		payload: 'Ошибка запроса',
	};
}

/** Ответ-ошибка для обработчика MSW: `handleLogin(apiErrorResponse(400, 'invalid_credentials'))`. */
export function apiErrorResponse(
	status: number,
	error: string,
	headers: Record<string, string> = {}
) {
	return () =>
		HttpResponse.json(apiErrorBody(status, error), { status, headers });
}

/** Ответы входа участника с ролью `role`: пароль, обмен challenge или код 2FA (`requirements`), профиль. */
export function serveSignInFlow({
	role = 'user',
	requirements = [],
}: { role?: Role; requirements?: string[] } = {}) {
	const email = accountEmail(role);
	const session = { session: 'token-new', expiresAt: hoursFromNow(12) };

	apiServer.use(
		handleLogin({ body: { challenge: 'challenge-1', requirements } }),
		handleExchangeChallenge({ body: session }),
		handleSubmitTotp({ body: session }),
		handleGetCurrentUser({ body: { id: `id-${role}`, email, role } })
	);

	return { email };
}

/** `GET /auth/me` принимает только `Bearer token`, на остальные - `401 not_auth`; возвращает присланные заголовки. */
export function serveCurrentUserForToken(token: string, role: Role = 'user') {
	const seen: string[] = [];

	apiServer.use(
		handleGetCurrentUser(({ request }) => {
			const authorization = request.headers.get('Authorization') ?? '';

			seen.push(authorization);

			return authorization === `Bearer ${token}`
				? HttpResponse.json({
						id: `id-${role}`,
						email: accountEmail(role),
						role,
					})
				: HttpResponse.json(apiErrorBody(401, 'not_auth'), { status: 401 });
		})
	);

	return seen;
}

/**
 * Ответ `GET /settings`: «сегодня» сервера (по умолчанию 24.10.2026), общее окно напоминания,
 * значение сервера и включены ли чеки (по умолчанию нет).
 */
export function serveSettings({
	today = '2026-10-24',
	reminderDaysBefore = 3,
	reminderDaysBeforeDefault = reminderDaysBefore,
	receiptsEnabled = false,
}: {
	today?: string;
	reminderDaysBefore?: number;
	reminderDaysBeforeDefault?: number;
	receiptsEnabled?: boolean;
} = {}) {
	apiServer.use(
		handleGetSettings({
			body: {
				today,
				timezone: 'Europe/Moscow',
				reminderDaysBefore,
				reminderDaysBeforeDefault,
				receiptsEnabled,
			},
		})
	);
}

/** Итоги валюты для ответа `GET /payments/summary`; незаданные суммы - ноль. */
export function currencyTotals(
	totals: Partial<CurrencyTotals> & Pick<CurrencyTotals, 'currency'>
): CurrencyTotals {
	return {
		totalMinor: 0,
		paidMinor: 0,
		unpaidMinor: 0,
		overdueMinor: 0,
		count: 0,
		paidCount: 0,
		unpaidCount: 0,
		overdueCount: 0,
		...totals,
	};
}

/**
 * Ответы экрана «Платежи»: настройки, периоды, итоги и отделы. Без аргументов - пустой экран;
 * вызывай в тестах, которые открывают `/payments` (туда ведёт вход).
 */
export function servePaymentsScreen({
	occurrences = [],
	totals = [],
	departments = [],
}: {
	occurrences?: PaymentOccurrence[];
	totals?: CurrencyTotals[];
	departments?: Department[];
} = {}) {
	serveSettings();
	apiServer.use(
		handleListPaymentOccurrences({
			body: { items: occurrences, total: occurrences.length },
		}),
		handleGetPaymentsSummary({
			body: {
				from: null,
				to: null,
				departmentId: null,
				currencies: (['RUB', 'USD', 'EUR'] as const).map(
					(currency) =>
						totals.find((item) => item.currency === currency) ??
						currencyTotals({ currency })
				),
			},
		}),
		handleListDepartments({
			body: { items: departments, total: departments.length },
		}),
		// Плановые периоды таблицы: по умолчанию их нет.
		handleGetPaymentsForecast({ body: { items: [], total: 0 } })
	);
}

function page<T>(items: T[], url: URL) {
	const limit = Number(url.searchParams.get('limit') ?? 50);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	return HttpResponse.json({
		items: items.slice(offset, offset + limit),
		total: items.length,
	});
}

/**
 * Ответы раздела «Регулярные платежи»: настройки, отделы, список платежей с фильтрами `status`
 * и `departmentId` по страницам, карточка платежа (иначе 404) и его периоды от новых к старым.
 */
export function serveRecurringScreen({
	payments = [],
	occurrences = [],
	departments = [],
}: {
	payments?: RecurringPayment[];
	occurrences?: PaymentOccurrence[];
	departments?: Department[];
} = {}) {
	serveSettings();
	apiServer.use(
		handleListDepartments({
			body: { items: departments, total: departments.length },
		}),
		handleListRecurringPayments(({ request }) => {
			const url = new URL(request.url);
			const status = url.searchParams.get('status');
			const dept = url.searchParams.get('departmentId');

			return page(
				payments.filter(
					(payment) =>
						(!status ||
							(status === 'stopped') === (payment.stoppedAt !== null)) &&
						(!dept ||
							(dept === 'none'
								? payment.department === null
								: payment.department?.id === dept))
				),
				url
			);
		}),
		handleGetRecurringPayment(({ params }) => {
			const payment = payments.find(({ id }) => id === params.payment_id);

			return payment
				? HttpResponse.json(payment)
				: HttpResponse.json(apiErrorBody(404, 'not_found'), { status: 404 });
		}),
		handleListPaymentOccurrences(({ request }) => {
			const url = new URL(request.url);
			const paymentId = url.searchParams.get('recurringPaymentId');

			return page(
				occurrences
					.filter(
						(occurrence) =>
							!paymentId || occurrence.recurringPayment.id === paymentId
					)
					.toSorted((a, b) => b.dueDate.localeCompare(a.dueDate)),
				url
			);
		})
	);
}
