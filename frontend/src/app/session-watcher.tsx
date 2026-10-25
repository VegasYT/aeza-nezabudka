import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { sessionStore } from '@shared/auth';

/** Сессия пропала (выход, другая вкладка, «Войти другим аккаунтом»): очищает кэш запросов и перепроверяет маршрут. */
export function SessionWatcher() {
	const router = useRouter();
	const queryClient = useQueryClient();

	useEffect(
		() =>
			sessionStore.subscribe((state, previous) => {
				if (previous.session && !state.session) {
					// Данные прежнего пользователя не должны мелькнуть следующему; на вход ведёт защита маршрута.
					queryClient.clear();
					void router.invalidate();
				}
			}),
		[router, queryClient]
	);

	return null;
}
