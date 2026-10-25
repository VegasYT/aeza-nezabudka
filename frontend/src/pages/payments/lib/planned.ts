import type { PaymentOccurrence, PlannedOccurrence } from '@shared/api';
import { type CalendarDate, daysBetween, formatDate } from '@shared/lib/dates';
import { formatDays } from '@shared/lib/plural';

import { type CalendarEntry, plannedAppearsOn } from './calendar';

type Order = 'asc' | 'desc';

/** Плановый период списка с датой, когда он появится. */
export type PlannedEntry = Extract<CalendarEntry, { kind: 'planned' }>;

/** Записи плановых периодов; дата появления - по известным срокам того же платежа. */
export function toPlannedEntries(
	planned: readonly PlannedOccurrence[],
	created: readonly PaymentOccurrence[]
): PlannedEntry[] {
	const known = [...created, ...planned];

	return planned.map((item) => ({
		kind: 'planned',
		key: `${item.recurringPayment.id}:${item.dueDate}`,
		planned: item,
		appearsOn: plannedAppearsOn(item, known),
	}));
}

/**
 * Плановые периоды страницы таблицы: между последним сроком предыдущей страницы и последним
 * сроком этой (при «сначала поздние» - зеркально). У первой страницы нет нижней границы,
 * у последней - верхней.
 */
export function plannedForPage(
	planned: readonly PlannedEntry[],
	{
		order,
		previousLast,
		last,
		lastPage,
	}: {
		order: Order;
		previousLast: CalendarDate | null;
		last: CalendarDate | null;
		lastPage: boolean;
	}
) {
	return planned.filter(({ planned: { dueDate } }) => {
		const open = lastPage || last === null;

		return order === 'asc'
			? (previousLast === null || dueDate > previousLast) &&
					(open || dueDate <= last)
			: (previousLast === null || dueDate < previousLast) &&
					(open || dueDate >= last);
	});
}

/** Плановые периоды догружаемого списка: не дальше последнего загруженного срока, пока есть ещё. */
export function plannedForLoaded(
	planned: readonly PlannedEntry[],
	{
		order,
		lastLoaded,
		complete,
	}: { order: Order; lastLoaded: CalendarDate | null; complete: boolean }
) {
	if (complete) {
		return [...planned];
	}

	if (lastLoaded === null) {
		return [];
	}

	return planned.filter(({ planned: { dueDate } }) =>
		order === 'asc' ? dueDate <= lastLoaded : dueDate >= lastLoaded
	);
}

function dueOf(entry: CalendarEntry) {
	return entry.kind === 'created'
		? entry.occurrence.dueDate
		: entry.planned.dueDate;
}

/** Созданные и плановые периоды по сроку; при одинаковом сроке созданный первым. */
export function mergeByDue(
	created: readonly PaymentOccurrence[],
	planned: readonly PlannedEntry[],
	order: Order
): CalendarEntry[] {
	const entries: CalendarEntry[] = [
		...created.map((occurrence) => ({
			kind: 'created' as const,
			key: occurrence.id,
			occurrence,
		})),
		...planned,
	];

	return entries
		.map((entry, index) => ({ entry, index }))
		.sort((a, b) => {
			const byDue = dueOf(a.entry).localeCompare(dueOf(b.entry));

			if (byDue !== 0) {
				return order === 'asc' ? byDue : -byDue;
			}

			return a.index - b.index;
		})
		.map(({ entry }) => entry);
}

/** Подпись планового периода: когда он появится или через сколько срок. */
export function plannedHint(entry: PlannedEntry, today: CalendarDate) {
	return entry.appearsOn
		? `появится ${formatDate(entry.appearsOn)}`
		: `срок через ${formatDays(daysBetween(today, entry.planned.dueDate))}`;
}
