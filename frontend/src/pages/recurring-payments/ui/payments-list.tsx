import { ActionIcon, Anchor, VisuallyHidden } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import {
	CompletedBadge,
	nextDueView,
	OverdueBadge,
	PaymentBadges,
	paymentProgress,
	scheduleLabel,
	StoppedBadge,
} from '@entities/recurring-payment';
import type { RecurringPayment } from '@shared/api';
import type { CalendarDate } from '@shared/lib/dates';
import { formatMoney } from '@shared/lib/money';
import { capitalize } from '@shared/lib/text';
import { IconBan, IconPencil, IconRefresh } from '@shared/ui/icons';

import classes from './recurring-payments.module.css';

interface PaymentsViewProps {
	payments: RecurringPayment[];
	today: CalendarDate;
	reminderDaysBefore: number;
	onEdit: (payment: RecurringPayment) => void;
	onStop: (payment: RecurringPayment) => void;
	onResume: (payment: RecurringPayment) => void;
}

/** Расписание и, у платежа с ограничением, сколько оплат сделано. */
function scheduleLine(payment: RecurringPayment) {
	return [scheduleLabel(payment), paymentProgress(payment)]
		.filter(Boolean)
		.join(' · ');
}

/** Ссылка на карточку платежа; фильтры списка остаются в адресе. */
export function PaymentLink({
	payment,
	className,
	children,
}: {
	payment: RecurringPayment;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Anchor
			className={className}
			underline='hover'
			renderRoot={(props) => (
				<Link
					to='/recurring-payments/$paymentId'
					params={{ paymentId: payment.id }}
					search
					{...props}
				/>
			)}
		>
			{children}
		</Anchor>
	);
}

/** Таблица регулярных платежей для окна от 768 px. */
export function PaymentsTable({
	payments,
	today,
	reminderDaysBefore,
	onEdit,
	onStop,
	onResume,
}: PaymentsViewProps) {
	return (
		<div className={classes.tableWrap}>
			<table className={classes.table}>
				<thead>
					<tr>
						<th scope='col'>Платёж</th>
						<th scope='col' className={classes.numeric}>
							Сумма
						</th>
						<th scope='col'>Ближайший срок</th>
						<th scope='col'>Отдел</th>
						<th scope='col'>
							<VisuallyHidden>Действия</VisuallyHidden>
						</th>
					</tr>
				</thead>
				<tbody>
					{payments.map((payment) => {
						const due = nextDueView(payment, today, reminderDaysBefore);
						const stopped = payment.stoppedAt !== null;

						return (
							<tr key={payment.id}>
								<td>
									<div className={classes.stack}>
										<span className={classes.nameLine}>
											<PaymentLink
												payment={payment}
												className={`${classes.name} ${stopped ? classes.stopped : ''}`}
											>
												{payment.name}
											</PaymentLink>
											<PaymentBadges payment={payment} />
										</span>
										<span className={classes.sub}>{scheduleLine(payment)}</span>
									</div>
								</td>
								<td
									className={`${classes.numeric} ${stopped ? classes.stopped : ''}`}
								>
									{formatMoney(payment.amountMinor, payment.currency)}
								</td>
								<td>
									<div className={classes.stack}>
										<span
											className={`${classes.date} ${due.date ? '' : classes.none}`}
										>
											{due.date ?? '—'}
										</span>
										<span
											className={`${classes.sub} ${due.soon ? classes.soon : ''}`}
										>
											{due.note}
										</span>
									</div>
								</td>
								<td className={payment.department ? undefined : classes.dim}>
									{payment.department?.name ?? 'Без отдела'}
								</td>
								<td>
									{stopped ? (
										<span className={classes.actions}>
											<ActionIcon
												variant='subtle'
												color='gray'
												size='lg'
												aria-label={`Возобновить: ${payment.name}`}
												title='Возобновить'
												onClick={() => onResume(payment)}
											>
												<IconRefresh size={20} />
											</ActionIcon>
										</span>
									) : (
										<span className={classes.actions}>
											<ActionIcon
												variant='subtle'
												color='gray'
												size='lg'
												aria-label={`Изменить: ${payment.name}`}
												title='Изменить'
												onClick={() => onEdit(payment)}
											>
												<IconPencil size={20} />
											</ActionIcon>
											<ActionIcon
												variant='subtle'
												color='gray'
												size='lg'
												aria-label={`Прекратить: ${payment.name}`}
												title='Прекратить'
												onClick={() => onStop(payment)}
											>
												<IconBan size={20} />
											</ActionIcon>
										</span>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

/** Список регулярных платежей карточками для телефона: нажатие открывает карточку платежа. */
export function PaymentCards({
	payments,
	today,
	reminderDaysBefore,
}: Omit<PaymentsViewProps, 'onEdit' | 'onStop' | 'onResume'>) {
	return (
		<div>
			{payments.map((payment) => {
				const due = nextDueView(payment, today, reminderDaysBefore);
				const schedule = scheduleLine(payment);

				return (
					<Link
						key={payment.id}
						to='/recurring-payments/$paymentId'
						params={{ paymentId: payment.id }}
						search
						className={classes.phoneCard}
					>
						<span className={classes.phoneCardHead}>
							<span className={classes.nameLine}>
								<span
									className={`${classes.name} ${payment.stoppedAt ? classes.stopped : ''}`}
								>
									{payment.name}
								</span>
								<StoppedBadge stopped={payment.stoppedAt !== null} />
								<CompletedBadge payment={payment} />
							</span>
							<span className={classes.phoneAmount}>
								{formatMoney(payment.amountMinor, payment.currency)}
							</span>
						</span>
						<span className={classes.phoneDue}>
							<span className={due.soon ? classes.soon : undefined}>
								{due.date ? `${due.date}, ${due.note}` : capitalize(due.note)}
							</span>
							<OverdueBadge payment={payment} />
						</span>
						<span className={classes.sub}>
							{payment.department?.name ?? 'Без отдела'} · {schedule}
						</span>
					</Link>
				);
			})}
		</div>
	);
}
