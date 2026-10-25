import { createFileRoute, redirect } from '@tanstack/react-router';

import { NotFoundPage } from '@pages/not-found';
import { settingsOptions } from '@shared/api';
import {
	currentUserOptions,
	getSession,
	isSessionExpired,
	requestReauth,
	SessionEndedError,
	setSessionEmail,
	signOut,
	whenTabsReady,
} from '@shared/auth';

import { AppLayout } from '../layout/app-layout';

export const Route = createFileRoute('/_authenticated')({
	beforeLoad: async ({ context, location, cause }) => {
		const toLogin = () =>
			redirect({ to: '/login', search: { redirect: location.href } });

		if (!getSession()) {
			await whenTabsReady();
		}

		const session = getSession();

		if (!session) {
			throw toLogin();
		}

		// Предзагрузка по наведению не открывает окно повторного входа: оно появится при самом переходе.
		if (cause === 'preload' && isSessionExpired(session)) {
			return;
		}

		try {
			if (isSessionExpired(session)) {
				await requestReauth();
			}

			// Настройки нужны каждому разделу: их запрос идёт параллельно с /auth/me, а не после него.
			void context.queryClient.prefetchQuery(settingsOptions());

			const user =
				await context.queryClient.ensureQueryData(currentUserOptions());

			if (user.role === 'integration') {
				await signOut();
				throw toLogin();
			}

			setSessionEmail(user.email);
		} catch (error) {
			if (error instanceof SessionEndedError) {
				throw toLogin();
			}

			throw error;
		}
	},
	component: AppLayout,
	notFoundComponent: NotFoundPage,
});
