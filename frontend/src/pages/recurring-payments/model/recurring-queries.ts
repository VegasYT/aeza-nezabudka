import {
	keepPreviousData,
	useInfiniteQuery,
	useQueries,
	useQuery,
} from '@tanstack/react-query';

import {
	departmentsOptions,
	getRecurringPaymentOptions,
	listPaymentOccurrencesInfiniteOptions,
	listRecurringPaymentsOptions,
	nextOffset,
} from '@shared/api';

import type { PaymentsFilter, RecurringSearch } from './recurring-search';

/** Платежей на странице списка. */
export const PAGE_SIZE = 50;

/** Периодов истории за одно «Показать ещё»: два года ежемесячного платежа. */
export const HISTORY_SIZE = 24;

/** Список платежей страницы `page` с фильтрами раздела. */
export function paymentsListOptions(search: RecurringSearch) {
	const status = search.status ?? 'active';

	return listRecurringPaymentsOptions({
		query: {
			status: status === 'all' ? undefined : status,
			departmentId: search.dept,
			limit: PAGE_SIZE,
			offset: ((search.page ?? 1) - 1) * PAGE_SIZE,
		},
	});
}

/** Список раздела: при смене фильтров прежние строки остаются до прихода новых. */
export function useRecurringPayments(search: RecurringSearch) {
	return useQuery({
		...paymentsListOptions(search),
		placeholderData: keepPreviousData,
	});
}

/** Сколько платежей у каждого пункта фильтра в выбранном отделе; `null`, пока не пришли оба числа. */
export function usePaymentCounts(
	dept: string | undefined
): Record<PaymentsFilter, number> | null {
	const [active, stopped] = useQueries({
		queries: (['active', 'stopped'] as const).map((status) =>
			listRecurringPaymentsOptions({
				query: { status, departmentId: dept, limit: 1 },
			})
		),
	});

	if (!active?.data || !stopped?.data) {
		return null;
	}

	return {
		active: active.data.total,
		stopped: stopped.data.total,
		all: active.data.total + stopped.data.total,
	};
}

/** Отделы для фильтра и формы. */
export function useDepartments() {
	const departments = useQuery(departmentsOptions());

	return departments.data?.items ?? [];
}

/** Регулярный платёж для карточки. */
export function paymentOptions(paymentId: string) {
	return getRecurringPaymentOptions({ path: { payment_id: paymentId } });
}

/** История периодов платежа от новых к старым, порциями по «Показать ещё». */
export function usePaymentHistory(paymentId: string) {
	return useInfiniteQuery({
		...listPaymentOccurrencesInfiniteOptions({
			query: {
				recurringPaymentId: paymentId,
				order: 'desc',
				limit: HISTORY_SIZE,
			},
		}),
		initialPageParam: 0,
		getNextPageParam: nextOffset,
	});
}
