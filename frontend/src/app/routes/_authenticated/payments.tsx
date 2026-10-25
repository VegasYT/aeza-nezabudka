import { createFileRoute } from '@tanstack/react-router';

import { PaymentsPage, validatePaymentsSearch } from '@pages/payments';
import { settingsOptions } from '@shared/api';

export const Route = createFileRoute('/_authenticated/payments')({
	validateSearch: validatePaymentsSearch,
	// Период по умолчанию считается от сегодня сервера: первый кадр ждёт настройки.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(settingsOptions()),
	component: PaymentsPage,
});
