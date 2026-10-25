import { createFileRoute } from '@tanstack/react-router';

import { NotificationsPage } from '@pages/notifications';
import { settingsOptions } from '@shared/api';

export const Route = createFileRoute('/_authenticated/notifications')({
	// Окно напоминания и «сегодня» для образцов сообщений: первый кадр ждёт настройки.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(settingsOptions()),
	component: NotificationsPage,
});
