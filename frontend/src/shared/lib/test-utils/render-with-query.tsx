import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

import { renderWithTheme } from './render-with-theme';

/** Рендерит компонент в теме Mantine со свежим клиентом запросов без повторов; возвращает и клиент. */
export function renderWithQuery(
	ui: ReactElement,
	options?: Omit<RenderOptions, 'wrapper'>
) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	return {
		queryClient,
		...renderWithTheme(
			<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
			options
		),
	};
}
