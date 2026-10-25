import { Modal, Stack } from '@mantine/core';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';

import {
	nextDueAfter,
	overdueDueDate,
	periodLabel,
	useRefreshRecurring,
} from '@entities/recurring-payment';
import {
	getApiErrorCode,
	getApiErrorMessage,
	type RecurringPayment,
	settingsOptions,
	stopRecurringPaymentMutation,
} from '@shared/api';
import { type CalendarDate, formatDate } from '@shared/lib/dates';
import { formatMoney } from '@shared/lib/money';
import { plural } from '@shared/lib/plural';
import {
	DialogActions,
	DialogError,
	DialogSubject,
	DialogText,
} from '@shared/ui/dialog';
import { IconAlertCircle, IconCalendar, IconDocument } from '@shared/ui/icons';

import classes from './recurring-payments.module.css';

/** Будущий период, который прекращение удалит: ближайший, а при сроке сегодня - следующий. */
function removedDue(payment: RecurringPayment, today: CalendarDate) {
	if (!payment.nextDueDate) {
		return null;
	}

	return payment.nextDueDate > today
		? payment.nextDueDate
		: nextDueAfter(payment.nextDueDate, payment);
}

function StopContent({
	payment,
	onClose,
}: {
	payment: RecurringPayment;
	onClose: () => void;
}) {
	const { data: settings } = useSuspenseQuery(settingsOptions());
	const { today } = settings;
	const refresh = useRefreshRecurring();
	const stop = useMutation({
		...stopRecurringPaymentMutation(),
		onSuccess: () => {
			void refresh();
			onClose();
		},
		onError: (error) => {
			// Платёж уже прекратили в другой вкладке: результат тот же.
			if (getApiErrorCode(error) === 'payment_stopped') {
				void refresh();
				onClose();
			}
		},
	});
	const amount = formatMoney(payment.amountMinor, payment.currency);
	const removed = removedDue(payment, today);
	const overdueDate = overdueDueDate(payment, today);
	const failed =
		stop.error && getApiErrorCode(stop.error) !== 'payment_stopped';

	return (
		<Stack gap='md'>
			<DialogSubject>
				{payment.name}, {amount}{' '}
				{periodLabel(payment.period, payment.periodCount)}
			</DialogSubject>
			<ul className={classes.stopList}>
				<li className={classes.stopItem}>
					<IconCalendar size={18} />
					<span>
						{removed
							? `Период ${formatDate(removed)} на\u00a0${amount} будет удалён. Новых периодов и\u00a0напоминаний не\u00a0будет.`
							: 'Новых периодов и\u00a0напоминаний не\u00a0будет.'}
					</span>
				</li>
				{payment.overdueCount > 0 && (
					<li className={classes.stopItem}>
						<IconAlertCircle size={18} />
						<span>
							{overdueDate
								? `Просроченный период ${formatDate(overdueDate)} останется в\u00a0платежах, его можно будет отметить оплаченным.`
								: `${plural(payment.overdueCount, 'просроченный период', 'просроченных периода', 'просроченных периодов')} останутся в\u00a0платежах, их можно будет отметить оплаченными.`}
						</span>
					</li>
				)}
				<li className={classes.stopItem}>
					<IconDocument size={18} />
					<span>
						Отметки об&nbsp;оплате и&nbsp;история периодов сохранятся.
					</span>
				</li>
			</ul>
			<DialogText quiet>
				{payment.nextDueDate === today &&
					'Период со\u00a0сроком сегодня не\u00a0удаляется: если его не\u00a0оплатить, завтра он станет просроченным. '}
				Платёж можно будет возобновить.
			</DialogText>
			{failed && <DialogError>{getApiErrorMessage(stop.error)}</DialogError>}
			<DialogActions
				danger
				confirmLabel='Прекратить платёж'
				pending={stop.isPending}
				onCancel={onClose}
				onConfirm={() => stop.mutate({ path: { payment_id: payment.id } })}
			/>
		</Stack>
	);
}

/** Подтверждение прекращения платежа: что удалится, что останется. */
export function StopPaymentDialog({
	payment,
	opened,
	onClose,
}: {
	payment: RecurringPayment | null;
	opened: boolean;
	onClose: () => void;
}) {
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title='Прекратить платёж?'
			size={480}
		>
			{payment && (
				<StopContent key={payment.id} payment={payment} onClose={onClose} />
			)}
		</Modal>
	);
}
