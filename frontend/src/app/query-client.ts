import { QueryClient } from '@tanstack/react-query';

/** Клиент запросов приложения; в тестах `test: true` выключает повторы, чтобы ошибка была видна сразу. */
export function createQueryClient({ test = false }: { test?: boolean } = {}) {
	return new QueryClient({
		defaultOptions: { queries: test ? { retry: false } : {} },
	});
}
