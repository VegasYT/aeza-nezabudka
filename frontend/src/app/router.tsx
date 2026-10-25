import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { ReauthHost } from './reauth-host';
import { routeTree } from './routeTree.gen';
import { SessionWatcher } from './session-watcher';

/** Контекст корневого маршрута: доступен в `beforeLoad` и `loader` каждого маршрута. */
export interface RouterContext {
	queryClient: QueryClient;
}

/** Настройки роутера, общие для приложения и `renderApp` в тестах. */
export function appRouterOptions(context: RouterContext) {
	return {
		routeTree,
		context,
		defaultPreload: 'intent',
		// Свежестью данных при предзагрузке управляет TanStack Query, а не кэш роутера.
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
		Wrap: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={context.queryClient}>
				{children}
			</QueryClientProvider>
		),
		// Окно повторного входа видно и тогда, когда переход ещё ждёт входа в beforeLoad.
		InnerWrap: ({ children }: { children: ReactNode }) => (
			<>
				{children}
				<ReauthHost />
				<SessionWatcher />
			</>
		),
	} as const;
}

/** Создаёт роутер приложения. */
export function createAppRouter(context: RouterContext) {
	return createRouter(appRouterOptions(context));
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}
}
