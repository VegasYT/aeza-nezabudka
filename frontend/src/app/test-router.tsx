import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';

import { ThemeRoot } from '@shared/ui/theme';

import { createQueryClient } from './query-client';
import { appRouterOptions } from './router';

/** Рендерит приложение целиком на адресе `path` с тестовым клиентом запросов. */
export function renderApp(path: string) {
	const router = createRouter({
		...appRouterOptions({ queryClient: createQueryClient({ test: true }) }),
		history: createMemoryHistory({ initialEntries: [path] }),
	});

	return {
		router,
		...render(
			<ThemeRoot env='test'>
				<RouterProvider router={router} />
			</ThemeRoot>
		),
	};
}
