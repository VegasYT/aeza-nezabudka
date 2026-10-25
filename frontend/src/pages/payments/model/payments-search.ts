import type { Currency, OccurrenceStatus } from '@shared/api';
import {
	addMonths,
	type CalendarDate,
	endOfMonth,
	formatDate,
	startOfMonth,
} from '@shared/lib/dates';
import { CURRENCIES } from '@shared/lib/money';
import { capitalize } from '@shared/lib/text';

/** Состояние экрана «Платежи» в адресе страницы; значения по умолчанию в адрес не пишутся. */
export interface PaymentsSearch {
	from?: CalendarDate;
	to?: CalendarDate;
	/** Отдел: id или `none` - платежи без отдела. */
	dept?: string;
	status?: OccurrenceStatus;
	currency?: Currency;
	/** По умолчанию сначала ранние сроки. */
	order?: 'desc';
	/** Номер страницы с 2; первая не пишется. */
	page?: number;
	/** Вид экрана; таблица не пишется. */
	view?: PaymentsView;
	/** Год бюджета; текущий год сервера не пишется. */
	year?: number;
	/** Регулярный платёж, окно которого открыто поверх экрана: прямая ссылка из Telegram. */
	payment?: string;
}

/** Виды экрана «Платежи» кроме таблицы. */
export type PaymentsView = 'calendar' | 'budget';

/** Период выборки: месяцы целиком, «по дату» или свой период. */
export type Period =
	| { kind: 'months'; from: CalendarDate; to: CalendarDate }
	| { kind: 'date'; to: CalendarDate }
	| { kind: 'range'; from: CalendarDate; to?: CalendarDate };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly OccurrenceStatus[] = ['unpaid', 'overdue', 'paid'];
const VIEWS: readonly PaymentsView[] = ['calendar', 'budget'];

function pick<T extends string>(value: unknown, allowed: readonly T[]) {
	return allowed.find((item) => item === value);
}

function date(value: unknown) {
	return typeof value === 'string' && DATE.test(value) ? value : undefined;
}

/** Разбирает адрес: неизвестные и битые значения отбрасываются. */
export function validatePaymentsSearch(
	raw: Record<string, unknown>
): PaymentsSearch {
	const page = Number(raw.page);
	const budgetYear = Number(raw.year);

	return {
		from: date(raw.from),
		to: date(raw.to),
		dept:
			typeof raw.dept === 'string' && raw.dept !== '' ? raw.dept : undefined,
		status: pick(raw.status, STATUSES),
		currency: pick(raw.currency, CURRENCIES),
		order: raw.order === 'desc' ? 'desc' : undefined,
		page: Number.isInteger(page) && page > 1 ? page : undefined,
		view: pick(raw.view, VIEWS),
		year:
			Number.isInteger(budgetYear) && budgetYear >= 2000 && budgetYear <= 2100
				? budgetYear
				: undefined,
		payment:
			typeof raw.payment === 'string' && raw.payment !== ''
				? raw.payment
				: undefined,
	};
}

/** Период по умолчанию: этот и следующий месяц от сегодня сервера. */
export function defaultPeriod(today: CalendarDate): Period {
	return {
		kind: 'months',
		from: startOfMonth(today),
		to: endOfMonth(addMonths(today, 1)),
	};
}

/** Период из адреса; без дат - период по умолчанию. */
export function resolvePeriod(
	{ from, to }: PaymentsSearch,
	today: CalendarDate
): Period {
	if (!from && !to) {
		return defaultPeriod(today);
	}

	if (!from && to) {
		return { kind: 'date', to };
	}

	if (from && to && from === startOfMonth(from) && to === endOfMonth(to)) {
		return { kind: 'months', from, to };
	}

	return { kind: 'range', from: from as CalendarDate, to };
}

/** Даты периода для адреса: период по умолчанию в адрес не пишется. */
export function periodSearch(
	period: Period,
	today: CalendarDate
): Pick<PaymentsSearch, 'from' | 'to'> {
	const fallback = defaultPeriod(today);

	if (
		period.kind === 'months' &&
		fallback.kind === 'months' &&
		period.from === fallback.from &&
		period.to === fallback.to
	) {
		return { from: undefined, to: undefined };
	}

	return period.kind === 'date'
		? { from: undefined, to: period.to }
		: { from: period.from, to: period.to };
}

/** Сдвигает месяцы периода на `months`, сохраняя их число. */
export function shiftPeriod(period: Period, months: number): Period {
	if (period.kind !== 'months') {
		return period;
	}

	return {
		kind: 'months',
		from: addMonths(period.from, months),
		to: endOfMonth(addMonths(period.to, months)),
	};
}

const MONTHS = [
	'январь',
	'февраль',
	'март',
	'апрель',
	'май',
	'июнь',
	'июль',
	'август',
	'сентябрь',
	'октябрь',
	'ноябрь',
	'декабрь',
];

const MONTHS_GENITIVE = [
	'января',
	'февраля',
	'марта',
	'апреля',
	'мая',
	'июня',
	'июля',
	'августа',
	'сентября',
	'октября',
	'ноября',
	'декабря',
];

function month(date: CalendarDate) {
	return Number(date.slice(5, 7)) - 1;
}

function year(date: CalendarDate) {
	return date.slice(0, 4);
}

/** Название месяца в именительном падеже с большой буквы: «Октябрь». */
export function monthName(date: CalendarDate) {
	return capitalize(MONTHS[month(date)] ?? '');
}

/** Месяц с годом для заголовков: «Ноябрь 2026». */
export function monthTitle(date: CalendarDate) {
	return `${monthName(date)} ${year(date)}`;
}

/** День с месяцем в родительном падеже: «19 ноября». */
export function formatDayMonth(date: CalendarDate) {
	return `${Number(date.slice(8, 10))}\u00a0${MONTHS_GENITIVE[month(date)]}`;
}

/** Подпись периода: «Октябрь 2026», «Октябрь и ноябрь 2026», «С сентября по ноябрь 2026», «По 30.11.2026». */
export function periodLabel(period: Period) {
	const nbsp = '\u00a0';

	if (period.kind === 'date') {
		return `По${nbsp}${formatDate(period.to)}`;
	}

	if (period.kind === 'range') {
		return period.to
			? `С${nbsp}${formatDate(period.from)} по${nbsp}${formatDate(period.to)}`
			: `С${nbsp}${formatDate(period.from)}`;
	}

	const { from, to } = period;
	const sameYear = year(from) === year(to);

	if (startOfMonth(to) === from) {
		return `${monthName(from)} ${year(from)}`;
	}

	if (sameYear && addMonths(from, 1) === startOfMonth(to)) {
		return `${monthName(from)} и${nbsp}${MONTHS[month(to)]} ${year(to)}`;
	}

	const start = `${MONTHS_GENITIVE[month(from)]}${sameYear ? '' : ` ${year(from)}`}`;

	return `С${nbsp}${start} по${nbsp}${MONTHS[month(to)]} ${year(to)}`;
}

/** Период внутри фразы: «за октябрь и ноябрь», «по 30.11.2026», «с 16.10.2026 по 15.11.2026». */
export function periodPhrase(period: Period) {
	const nbsp = '\u00a0';

	if (period.kind === 'date') {
		return `по${nbsp}${formatDate(period.to)}`;
	}

	if (period.kind === 'range') {
		return period.to
			? `с${nbsp}${formatDate(period.from)} по${nbsp}${formatDate(period.to)}`
			: `с${nbsp}${formatDate(period.from)}`;
	}

	const { from, to } = period;

	if (startOfMonth(to) === from) {
		return `за${nbsp}${MONTHS[month(from)]}`;
	}

	if (addMonths(from, 1) === startOfMonth(to)) {
		return `за${nbsp}${MONTHS[month(from)]} и${nbsp}${MONTHS[month(to)]}`;
	}

	return `с${nbsp}${MONTHS_GENITIVE[month(from)]} по${nbsp}${MONTHS[month(to)]}`;
}

/** Начало периода для строки о прошлой просрочке: «раньше октября», «раньше 16.10.2026». */
export function beforePeriodLabel(period: Period) {
	if (period.kind === 'date') {
		return null;
	}

	return period.kind === 'months'
		? `раньше ${MONTHS_GENITIVE[month(period.from)]}`
		: `раньше ${formatDate(period.from)}`;
}
