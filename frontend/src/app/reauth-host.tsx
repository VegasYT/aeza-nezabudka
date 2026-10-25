import { lazy, Suspense } from 'react';

import { useReauthOpen } from '@shared/auth';

// Окно тянет форму входа с zod и TanStack Form: грузим его только когда сессия закончилась, а не с приложением.
const ReauthDialog = lazy(() =>
	import('@features/sign-in').then(({ ReauthDialog: Dialog }) => ({
		default: Dialog,
	}))
);

/** Показывает окно повторного входа, когда его запросил клиент API или защита маршрута. */
export function ReauthHost() {
	const opened = useReauthOpen();

	return opened ? (
		<Suspense fallback={null}>
			<ReauthDialog />
		</Suspense>
	) : null;
}
