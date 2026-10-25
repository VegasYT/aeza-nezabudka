import type { PaymentOccurrence, PlannedOccurrence } from '@shared/api';
import {
	addDays,
	addMonths,
	type CalendarDate,
	daysBetween,
	endOfMonth,
	formatDate,
	startOfMonth,
} from '@shared/lib/dates';
import { formatMoney } from '@shared/lib/money';

import type { Period } from '../model/payments-search';

/** Сколько месяцев календарь показывает за раз. */
export const MAX_CALENDAR_MONTHS = 12;

/** Первые числа месяцев сетки: месяцы периода, у «На дату» - с текущего месяца. */
export function calendarMonths(
	period: Period,
	today: CalendarDate
): CalendarDate[] {
	const first =
		period.kind === 'date' ? startOfMonth(today) : startOfMonth(period.from);
	const end =
		period.kind === 'range' && !period.to
			? first
			: startOfMonth(period.to ?? first);
	const months: CalendarDate[] = [];

	for (
		let month = first;
		month <= end && months.length < MAX_CALENDAR_MONTHS;
		month = addMonths(month, 1)
	) {
		months.push(month);
	}

	return months.length > 0 ? months : [startOfMonth(today)];
}

/** Диапазон сетки: с первого числа первого месяца по последнее число последнего. */
export function calendarRange(months: readonly CalendarDate[]) {
	const first = months[0] as CalendarDate;
	const last = months.at(-1) as CalendarDate;

	return { from: first, to: endOfMonth(last) };
}

// День недели с понедельника: 0 - понедельник, 6 - воскресенье.
function weekday(date: CalendarDate) {
	return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Недели месяца с понедельника; дни соседних месяцев - `null`. */
export function monthWeeks(month: CalendarDate): (CalendarDate | null)[][] {
	const first = startOfMonth(month);
	const days = daysBetween(first, endOfMonth(month)) + 1;
	const cells: (CalendarDate | null)[] = [
		...Array.from({ length: weekday(first) }, () => null),
		...Array.from({ length: days }, (_, index) => addDays(first, index)),
	];

	while (cells.length % 7 !== 0) {
		cells.push(null);
	}

	return Array.from({ length: cells.length / 7 }, (_, week) =>
		cells.slice(week * 7, week * 7 + 7)
	);
}

/** Срок, к которому относится период: созданный или плановый. */
interface Dated {
	recurringPayment: { id: string };
	dueDate: CalendarDate;
}

/**
 * Когда появится плановый период: сервер создаёт его в день срока предыдущего периода
 * того же платежа. `null` - предыдущего периода нет среди загруженных.
 */
export function plannedAppearsOn(
	planned: PlannedOccurrence,
	known: readonly Dated[]
): CalendarDate | null {
	let previous: CalendarDate | null = null;

	for (const item of known) {
		if (
			item.recurringPayment.id === planned.recurringPayment.id &&
			item.dueDate < planned.dueDate &&
			(previous === null || item.dueDate > previous)
		) {
			previous = item.dueDate;
		}
	}

	return previous;
}

/** Период в календаре: созданный на сервере или плановый по расписанию. */
export type CalendarEntry =
	| { kind: 'created'; key: string; occurrence: PaymentOccurrence }
	| {
			kind: 'planned';
			key: string;
			planned: PlannedOccurrence;
			appearsOn: CalendarDate | null;
	  };

/** Созданный или плановый период записи календаря. */
export function entrySource(entry: CalendarEntry) {
	return entry.kind === 'created' ? entry.occurrence : entry.planned;
}

/** Название платежа периода. */
export function entryName(entry: CalendarEntry) {
	return entrySource(entry).recurringPayment.name;
}

/** Периоды по дням срока, в дне - по названию платежа. */
export function entriesByDay(
	occurrences: readonly PaymentOccurrence[],
	planned: readonly PlannedOccurrence[]
) {
	const known = [...occurrences, ...planned];
	const days = new Map<CalendarDate, CalendarEntry[]>();
	const add = (day: CalendarDate, entry: CalendarEntry) =>
		days.set(day, [...(days.get(day) ?? []), entry]);

	for (const occurrence of occurrences) {
		add(occurrence.dueDate, {
			kind: 'created',
			key: occurrence.id,
			occurrence,
		});
	}

	for (const item of planned) {
		add(item.dueDate, {
			kind: 'planned',
			key: `${item.recurringPayment.id}:${item.dueDate}`,
			planned: item,
			appearsOn: plannedAppearsOn(item, known),
		});
	}

	for (const entries of days.values()) {
		entries.sort((a, b) => entryName(a).localeCompare(entryName(b), 'ru'));
	}

	return days;
}

/** Сумма периода коротко для клетки: «150 000 ₽», «12,99 €». */
export function shortAmount(entry: CalendarEntry) {
	const { amountMinor, currency } = entrySource(entry);

	return formatMoney(amountMinor, currency).replace(/,00(?=\u00a0)/, '');
}

/** Пояснение к плановому периоду: когда он появится и что с ним можно сделать. */
export function plannedNote(appearsOn: CalendarDate | null) {
	return appearsOn
		? `Период появится ${formatDate(appearsOn)}, в\u00a0день срока предыдущего. С\u00a0этого дня можно отметить оплату.`
		: 'Период появится в\u00a0день срока предыдущего. С\u00a0этого дня можно отметить оплату.';
}
