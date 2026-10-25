import { createFileRoute } from '@tanstack/react-router';

import { RecurringPaymentCard } from '@pages/recurring-payments';

export const Route = createFileRoute(
	'/_authenticated/_admin/recurring-payments/$paymentId'
)({
	component: RecurringPaymentCard,
});
