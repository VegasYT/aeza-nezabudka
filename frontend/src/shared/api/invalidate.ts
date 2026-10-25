import type { QueryClient } from '@tanstack/react-query';

/**
 * Перечитать все запросы этих операций контракта с любыми параметрами: `['listPaymentOccurrences']`.
 * Ключи сгенерированных опций начинаются с объекта с `_id` операции.
 */
export function invalidateOperations(
	queryClient: QueryClient,
	operations: readonly string[]
) {
	return queryClient.invalidateQueries({
		predicate: ({ queryKey }) => {
			const [key] = queryKey as [{ _id?: string } | undefined];

			return operations.includes(key?._id ?? '');
		},
	});
}
