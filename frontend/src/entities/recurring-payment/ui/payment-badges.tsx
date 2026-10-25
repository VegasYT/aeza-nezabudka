import type { RecurringPayment } from '@shared/api';

import { overdueLabel } from '../model/payment-view';
import classes from './payment-badges.module.css';

/** Метка «прекращён»: у платежа это `stoppedAt`, у его периода - `recurringPayment.stopped`. */
export function StoppedBadge({ stopped }: { stopped: boolean }) {
	return (
		stopped && (
			<span className={`${classes.badge} ${classes.badgeStopped}`}>
				прекращён
			</span>
		)
	);
}

/** Метка «завершён» у платежа, у которого сделаны все оплаты. */
export function CompletedBadge({
	payment,
}: {
	payment: Pick<RecurringPayment, 'completed' | 'stoppedAt'>;
}) {
	return (
		payment.completed &&
		!payment.stoppedAt && (
			<span className={`${classes.badge} ${classes.badgeCompleted}`}>
				завершён
			</span>
		)
	);
}

/** Метка «просрочено N дн.» по самому старому неоплаченному периоду. */
export function OverdueBadge({
	payment,
}: {
	payment: Pick<RecurringPayment, 'overdueCount' | 'oldestOverdueDays'>;
}) {
	const overdue = overdueLabel(payment);

	return (
		overdue && (
			<span className={`${classes.badge} ${classes.badgeOverdue}`}>
				{overdue}
			</span>
		)
	);
}

/** Метки платежа подряд: «прекращён», «завершён», «просрочено N дн.». */
export function PaymentBadges({ payment }: { payment: RecurringPayment }) {
	return (
		<>
			<StoppedBadge stopped={payment.stoppedAt !== null} />
			<CompletedBadge payment={payment} />
			<OverdueBadge payment={payment} />
		</>
	);
}
