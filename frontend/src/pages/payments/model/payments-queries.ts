import {
	keepPreviousData,
	type QueryClient,
	useInfiniteQuery,
	useQuery,
} from '@tanstack/react-query';

import {
	getPaymentsSummaryOptions,
	invalidateOperations,
	listPaymentOccurrencesInfiniteOptions,
	listPaymentOccurrencesOptions,
	nextOffset,
} from '@shared/api';
import { addDays } from '@shared/lib/dates';

import type { PaymentsSearch, Period } from './payments-search';

/** Периодов на странице таблицы. */
export const PAGE_SIZE = 50;

function periodDates(period: Period) {
	return period.kind === 'date'
		? { to: period.to }
		: { from: period.from, to: period.to };
}

/** Список периодов страницы `page` с фильтрами экрана. */
export function occurrencesOptions(search: PaymentsSearch, period: Period) {
	return listPaymentOccurrencesOptions({
		query: {
			...periodDates(period),
			departmentId: search.dept,
			status: search.status,
			currency: search.currency,
			order: search.order ?? 'asc',
			limit: PAGE_SIZE,
			offset: ((search.page ?? 1) - 1) * PAGE_SIZE,
		},
	});
}

/** Периодов за одно «Показать ещё» на телефоне. */
export const PHONE_PAGE_SIZE = 20;

/** Список периодов телефона: следующие страницы догружаются по «Показать ещё». */
export function usePhoneOccurrences(
	search: PaymentsSearch,
	period: Period,
	enabled: boolean
) {
	return useInfiniteQuery({
		...listPaymentOccurrencesInfiniteOptions({
			query: {
				...periodDates(period),
				departmentId: search.dept,
				status: search.status,
				currency: search.currency,
				order: search.order ?? 'asc',
				limit: PHONE_PAGE_SIZE,
			},
		}),
		initialPageParam: 0,
		getNextPageParam: nextOffset,
		placeholderData: keepPreviousData,
		enabled,
	});
}

/** Итоги по валютам вместе с плановыми периодами: зависят только от периода и отдела. */
export function summaryOptions(search: PaymentsSearch, period: Period) {
	return getPaymentsSummaryOptions({
		query: {
			...periodDates(period),
			departmentId: search.dept,
			// Плановые периоды сервер считает только до конца периода.
			...(period.to ? { includePlanned: true } : {}),
		},
	});
}

/** Итоги таблицы и календаря: при смене периода или отдела прежние остаются до прихода новых. */
export function useSummary(search: PaymentsSearch, period: Period) {
	return useQuery({
		...summaryOptions(search, period),
		placeholderData: keepPreviousData,
	});
}

/** Страница таблицы периодов; на телефоне свой список с «Показать ещё». */
export function useTablePage(
	search: PaymentsSearch,
	period: Period,
	enabled: boolean
) {
	return useQuery({
		...occurrencesOptions(search, period),
		placeholderData: keepPreviousData,
		enabled,
	});
}

/** Срок последнего периода предыдущей страницы таблицы: граница плановых периодов. */
export function usePreviousPageLast(
	search: PaymentsSearch,
	period: Period,
	enabled: boolean
) {
	const page = search.page ?? 1;
	const previous = useQuery({
		...listPaymentOccurrencesOptions({
			query: {
				...periodDates(period),
				departmentId: search.dept,
				status: search.status,
				currency: search.currency,
				order: search.order ?? 'asc',
				limit: 1,
				offset: (page - 1) * PAGE_SIZE - 1,
			},
		}),
		enabled: enabled && page > 1,
	});

	return page > 1 ? (previous.data?.items[0]?.dueDate ?? null) : null;
}

/** Просрочка раньше начала периода: число периодов и суммы по валютам. */
export function useOlderOverdue(search: PaymentsSearch, period: Period) {
	const before = period.kind === 'date' ? null : addDays(period.from, -1);
	const enabled = before !== null && search.status !== 'paid';
	const filters = { to: before ?? undefined, departmentId: search.dept };

	const count = useQuery({
		...listPaymentOccurrencesOptions({
			query: {
				...filters,
				status: 'overdue',
				currency: search.currency,
				limit: 1,
				order: 'asc',
			},
		}),
		enabled,
	});
	const sums = useQuery({
		...getPaymentsSummaryOptions({ query: filters }),
		enabled,
	});

	if (!enabled || !count.data || !sums.data || count.data.total === 0) {
		return null;
	}

	return {
		total: count.data.total,
		firstDueDate: count.data.items[0]?.dueDate ?? null,
		currencies: sums.data.currencies.filter(
			(totals) =>
				totals.overdueMinor > 0 &&
				(!search.currency || totals.currency === search.currency)
		),
	};
}

/** Перечитать периоды, итоги и открытый по ссылке платёж после записи. */
export function invalidatePayments(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		'listPaymentOccurrences',
		'getPaymentsSummary',
		'getRecurringPayment',
	]);
}
