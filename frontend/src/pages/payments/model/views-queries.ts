import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
	getPaymentsForecast,
	getPaymentsForecastQueryKey,
	getPaymentsSummaryOptions,
	listPaymentOccurrences,
	listPaymentOccurrencesQueryKey,
} from '@shared/api';
import { addDays, addMonths, type CalendarDate } from '@shared/lib/dates';

import { calendarMonths, calendarRange } from '../lib/calendar';
import type { PaymentsSearch, Period } from './payments-search';

// Предел страницы API: календарь и плановые периоды берут весь диапазон, по 100 записей за запрос.
const PAGE_LIMIT = 100;

/** Все страницы списка `{ items, total }`: первая говорит, сколько всего, остальные идут параллельно. */
async function fetchAllPages<T>(
	fetchPage: (offset: number) => Promise<{ items: T[]; total: number }>
) {
	const first = await fetchPage(0);
	const offsets: number[] = [];

	for (
		let offset = Math.max(first.items.length, 1);
		offset < first.total;
		offset += PAGE_LIMIT
	) {
		offsets.push(offset);
	}

	const rest = await Promise.all(offsets.map(fetchPage));

	return [first, ...rest].flatMap((page) => page.items);
}

type OccurrencesQuery = Omit<
	NonNullable<Parameters<typeof listPaymentOccurrences>[0]>['query'],
	'offset'
>;
type ForecastQuery = Omit<
	Parameters<typeof getPaymentsForecast>[0]['query'],
	'offset'
>;

// Ключ начинается с ключа операции: invalidateOperations находит запрос по её `_id`.
function allOccurrencesOptions(query: OccurrencesQuery) {
	return {
		queryKey: [...listPaymentOccurrencesQueryKey({ query }), 'all'] as const,
		queryFn: ({ signal }: { signal: AbortSignal }) =>
			fetchAllPages((offset) =>
				listPaymentOccurrences({
					query: { ...query, offset },
					signal,
					throwOnError: true,
				}).then(({ data }) => data)
			),
	};
}

function allForecastOptions(query: ForecastQuery) {
	return {
		queryKey: [...getPaymentsForecastQueryKey({ query }), 'all'] as const,
		queryFn: ({ signal }: { signal: AbortSignal }) =>
			fetchAllPages((offset) =>
				getPaymentsForecast({
					query: { ...query, offset },
					signal,
					throwOnError: true,
				}).then(({ data }) => data)
			),
	};
}

/**
 * Периоды календаря: созданные с фильтрами экрана и плановые по расписанию за месяцы сетки.
 * Плановые не оплачены и не просрочены, поэтому при этих статусах не запрашиваются.
 */
export function useCalendarData(
	search: PaymentsSearch,
	period: Period,
	today: CalendarDate
) {
	const months = calendarMonths(period, today);
	const range = calendarRange(months);
	const created = useQuery({
		...allOccurrencesOptions({
			from: range.from,
			to: range.to,
			departmentId: search.dept,
			status: search.status,
			currency: search.currency,
			order: 'asc',
			limit: PAGE_LIMIT,
		}),
		placeholderData: keepPreviousData,
	});
	const plannedFrom = range.from > today ? range.from : today;
	const withPlanned =
		(search.status === undefined || search.status === 'unpaid') &&
		plannedFrom <= range.to;
	const planned = useQuery({
		...allForecastOptions({
			from: plannedFrom,
			to: range.to,
			departmentId: search.dept,
			limit: PAGE_LIMIT,
		}),
		placeholderData: keepPreviousData,
		enabled: withPlanned,
	});
	const plannedItems = (planned.data ?? []).filter(
		(item) => !search.currency || item.currency === search.currency
	);

	return {
		months,
		occurrences: created.data ?? [],
		planned: withPlanned ? plannedItems : [],
		isPending: created.isPending || (withPlanned && planned.isPending),
		isError:
			(created.isError && !created.data) ||
			(withPlanned && planned.isError && !planned.data),
		isFetching: created.isFetching || planned.isFetching,
		refetch: () => {
			void created.refetch();
			void planned.refetch();
		},
	};
}

/** Итоги года по месяцам вместе с плановыми суммами для бюджета. */
export function useBudget(dept: string | undefined, year: number) {
	return useQuery({
		...getPaymentsSummaryOptions({
			query: {
				from: `${year}-01-01`,
				to: `${year}-12-31`,
				departmentId: dept,
				groupBy: 'month',
				includePlanned: true,
			},
		}),
		placeholderData: keepPreviousData,
	});
}

/**
 * Плановые периоды таблицы за период экрана. Нужен конец периода; диапазон больше двух лет
 * обрезается: дальше сервер не считает.
 */
export function usePlannedPeriods(
	search: PaymentsSearch,
	period: Period,
	today: CalendarDate
) {
	const end = period.to;
	const start =
		period.kind === 'date' || period.from < today ? today : period.from;
	const limit = addDays(addMonths(start, 24), -1);
	const to = end && end > limit ? limit : end;
	const active =
		to !== undefined &&
		start <= to &&
		(search.status === undefined || search.status === 'unpaid');
	const result = useQuery({
		...allForecastOptions({
			from: start,
			to: to ?? start,
			departmentId: search.dept,
			limit: PAGE_LIMIT,
		}),
		placeholderData: keepPreviousData,
		enabled: active,
	});

	return active
		? (result.data ?? []).filter(
				(item) => !search.currency || item.currency === search.currency
			)
		: [];
}
