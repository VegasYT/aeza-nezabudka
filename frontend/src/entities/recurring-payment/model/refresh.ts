import { useQueryClient } from '@tanstack/react-query';

import { invalidateOperations } from '@shared/api';

/** Перечитать платежи, их периоды, итоги, прогноз и отделы (число платежей) после записи. */
export function useRefreshRecurring() {
	const queryClient = useQueryClient();

	return () =>
		invalidateOperations(queryClient, [
			'listRecurringPayments',
			'getRecurringPayment',
			'listPaymentOccurrences',
			'getPaymentsSummary',
			'getPaymentsForecast',
			'listDepartments',
		]);
}
