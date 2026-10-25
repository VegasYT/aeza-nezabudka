import { createFileRoute } from '@tanstack/react-router';

import {
	RecurringPaymentsPage,
	validateRecurringSearch,
} from '@pages/recurring-payments';
import { settingsOptions } from '@shared/api';

export const Route = createFileRoute(
	'/_authenticated/_admin/recurring-payments'
)({
	validateSearch: validateRecurringSearch,
	// Подписи сроков и форма считают дни от сегодня сервера.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(settingsOptions()),
	component: RecurringPaymentsPage,
});
