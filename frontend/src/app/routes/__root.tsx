import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { NotFoundPage } from '@pages/not-found';

import type { RouterContext } from '../router';

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootLayout,
	notFoundComponent: NotFoundPage,
});

function RootLayout() {
	return (
		<>
			<Outlet />
			{/* Панели отладки сами не рендерятся вне режима разработки. */}
			<ReactQueryDevtools buttonPosition='bottom-left' />
			<TanStackRouterDevtools position='bottom-right' />
		</>
	);
}
