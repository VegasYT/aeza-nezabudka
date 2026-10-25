import { Anchor, Button, Modal, Skeleton, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
	isPaymentMissing,
	PaymentBadges,
	paymentProgress,
	scheduleLabel,
} from '@entities/recurring-payment';
import {
	getRecurringPaymentOptions,
	listPaymentOccurrencesOptions,
	type PaymentOccurrence,
} from '@shared/api';
import { useCurrentUser } from '@shared/auth';
import type { CalendarDate } from '@shared/lib/dates';
import { formatMoney } from '@shared/lib/money';
import { LoadError } from '@shared/ui/list-state';

import type { OccurrenceHandlers } from './occurrence-actions';
import { OccurrencesTable } from './occurrences-table';
import classes from './payment-dialog.module.css';
import { OccurrenceCards } from './phone-payments';

/** Сколько последних периодов показывает окно; вся история - в карточке платежа. */
const PERIODS_LIMIT = 12;

/** Окно платежа по прямой ссылке `?payment=<id>`: сведения и последние периоды с действиями, как в таблице. */
export function PaymentDialog({
	paymentId,
	phone,
	today,
	reminderDaysBefore,
	pendingId,
	handlers,
	onOpenActions,
	onClose,
}: {
	paymentId: string;
	phone: boolean;
	today: CalendarDate;
	reminderDaysBefore: number;
	pendingId: string | null;
	handlers: OccurrenceHandlers;
	/** Лист действий телефона. */
	onOpenActions: (occurrence: PaymentOccurrence) => void;
	onClose: () => void;
}) {
	const isAdmin = useCurrentUser()?.role === 'admin';
	const payment = useQuery(
		getRecurringPaymentOptions({ path: { payment_id: paymentId } })
	);
	const periods = useQuery(
		listPaymentOccurrencesOptions({
			query: {
				recurringPaymentId: paymentId,
				order: 'desc',
				limit: PERIODS_LIMIT,
			},
		})
	);
	const [order, setOrder] = useState<'asc' | 'desc'>('desc');
	const missing = payment.isError && isPaymentMissing(payment.error);
	const items = periods.data?.items ?? [];
	const total = periods.data?.total ?? 0;

	const body = () => {
		if (missing) {
			return (
				<div className={classes.state}>
					<Text c='dimmed'>Такого платежа нет. Проверьте ссылку.</Text>
					<Button variant='light' onClick={onClose}>
						Закрыть
					</Button>
				</div>
			);
		}

		if (payment.isError || periods.isError) {
			return (
				<LoadError
					title='Не удалось загрузить платёж'
					onRetry={() => {
						void payment.refetch();
						void periods.refetch();
					}}
				/>
			);
		}

		if (!payment.data || !periods.data) {
			return (
				<div className={classes.state} aria-hidden='true'>
					<Skeleton height={14} width='60%' />
					<Skeleton height={14} width='80%' />
				</div>
			);
		}

		const data = payment.data;
		const facts = [
			formatMoney(data.amountMinor, data.currency),
			scheduleLabel(data),
			paymentProgress(data),
			data.department?.name ?? 'Без отдела',
		].filter(Boolean);

		return (
			<>
				<div className={classes.summary}>
					<span className={classes.badges}>
						<PaymentBadges payment={data} />
					</span>
					<span className={classes.facts}>{facts.join(' · ')}</span>
				</div>
				{items.length === 0 ? (
					<Text c='dimmed' className={classes.state}>
						Периодов пока нет.
					</Text>
				) : phone ? (
					<OccurrenceCards
						occurrences={items}
						order='desc'
						showPayment={false}
						today={today}
						reminderDaysBefore={reminderDaysBefore}
						pendingId={pendingId}
						onMark={handlers.onMark}
						onOpenActions={onOpenActions}
					/>
				) : (
					<OccurrencesTable
						occurrences={items}
						today={today}
						reminderDaysBefore={reminderDaysBefore}
						order={order}
						pendingId={pendingId}
						onToggleOrder={() =>
							setOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
						}
						showPayment={false}
						{...handlers}
					/>
				)}
				{(total > PERIODS_LIMIT || isAdmin) && (
					<div className={classes.footer}>
						<span className={classes.muted}>
							{total > PERIODS_LIMIT &&
								`Показаны последние ${PERIODS_LIMIT} из\u00a0${total}`}
						</span>
						{isAdmin && (
							<Anchor
								underline='hover'
								renderRoot={(props) => (
									<Link
										to='/recurring-payments/$paymentId'
										params={{ paymentId }}
										{...props}
									/>
								)}
							>
								Карточка платежа
							</Anchor>
						)}
					</div>
				)}
			</>
		);
	};

	return (
		<Modal
			opened
			onClose={onClose}
			title={missing ? 'Платёж не найден' : (payment.data?.name ?? 'Платёж')}
			classNames={{ body: classes.body }}
			closeButtonProps={{ 'aria-label': 'Закрыть' }}
			size={phone ? undefined : 920}
			fullScreen={phone}
		>
			{body()}
		</Modal>
	);
}
