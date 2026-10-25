import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';

import { LoginPage } from '@pages/login';
import { getSession, isSessionExpired, whenTabsReady } from '@shared/auth';

// После входа открываем только адрес самой панели: чужой адрес из ссылки не подставится.
function safeRedirect(target: string | undefined) {
	return target?.startsWith('/') &&
		!target.startsWith('//') &&
		!target.startsWith('/login')
		? target
		: '/payments';
}

export const Route = createFileRoute('/login')({
	// Без zod: схема маршрута попадает в основной бандл, а zod нужен только форме входа.
	validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
		redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
	}),
	beforeLoad: async () => {
		// Новая вкладка, открытая на входе, тоже берёт сессию у уже открытых.
		await whenTabsReady();

		const session = getSession();

		if (session && !isSessionExpired(session)) {
			throw redirect({ to: '/payments' });
		}
	},
	component: LoginRoute,
});

function LoginRoute() {
	const { redirect: target } = Route.useSearch();
	const router = useRouter();

	return (
		<LoginPage onSignedIn={() => router.history.push(safeRedirect(target))} />
	);
}
