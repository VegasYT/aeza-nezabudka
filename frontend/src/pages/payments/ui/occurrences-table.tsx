import { UnstyledButton, VisuallyHidden } from '@mantine/core';

import {
	occurrenceStatus,
	StatusMark,
	TONE_CLASS,
} from '@entities/payment-occurrence';
import type { PaymentOccurrence } from '@shared/api';
import { type CalendarDate, formatDate } from '@shared/lib/dates';
import { formatMoney } from '@shared/lib/money';
import { IconArrowDown, IconArrowUp } from '@shared/ui/icons';
import { StoppedBadge } from '@entities/recurring-payment';

import { mergeByDue, type PlannedEntry, plannedHint } from '../lib/planned';
import { PlannedMark } from './calendar-entry';
import {
	MarkButton,
	OccurrenceMenu,
	type OccurrenceHandlers,
} from './occurrence-actions';
import classes from './payments-page.module.css';

function PlannedRow({
	entry,
	today,
	showPayment,
}: {
	entry: PlannedEntry;
	today: CalendarDate;
	showPayment: boolean;
}) {
	const { planned } = entry;

	return (
		<tr className={classes.plannedRow}>
			{showPayment && (
				<td>
					<div className={classes.name}>{planned.recurringPayment.name}</div>
					<div className={classes.muted}>
						{planned.department?.name ?? 'Без отдела'}
					</div>
				</td>
			)}
			<td className={`${classes.numeric} ${classes.amount}`}>
				{formatMoney(planned.amountMinor, planned.currency)}
			</td>
			<td className={classes.due}>{formatDate(planned.dueDate)}</td>
			<td>
				<span className={classes.status}>
					<PlannedMark />
					<span className={classes.statusText}>
						<span>По&nbsp;расписанию</span>
						<span className={classes.muted}>{plannedHint(entry, today)}</span>
					</span>
				</span>
			</td>
			<td>
				<span className={classes.none}>—</span>
			</td>
			<td className={classes.numeric}>
				<span className={classes.none}>—</span>
			</td>
			<td />
		</tr>
	);
}

/** Таблица периодов: колонки по кейсу, просрочка отдельной колонкой. */
export function OccurrencesTable({
	occurrences,
	today,
	reminderDaysBefore,
	planned = [],
	order,
	pendingId,
	onToggleOrder,
	showPayment = true,
	...handlers
}: OccurrenceHandlers & {
	occurrences: PaymentOccurrence[];
	/** Плановые периоды этой страницы: встают по сроку среди созданных. */
	planned?: PlannedEntry[];
	today: CalendarDate;
	reminderDaysBefore: number;
	order: 'asc' | 'desc';
	pendingId: string | null;
	onToggleOrder: () => void;
	/** Колонка «Платёж»; в окне одного платежа она не нужна. */
	showPayment?: boolean;
}) {
	return (
		<div className={classes.tableWrap}>
			<table
				className={`${classes.table} ${showPayment ? '' : classes.tableCompact}`}
			>
				<thead>
					<tr>
						{showPayment && <th scope='col'>Платёж</th>}
						<th scope='col' className={classes.numeric}>
							Сумма
						</th>
						<th
							scope='col'
							aria-sort={order === 'asc' ? 'ascending' : 'descending'}
						>
							<UnstyledButton
								className={classes.sort}
								onClick={onToggleOrder}
								aria-label={
									order === 'asc'
										? 'Срок: сначала ранние, показать сначала поздние'
										: 'Срок: сначала поздние, показать сначала ранние'
								}
							>
								Срок
								{order === 'asc' ? (
									<IconArrowDown size={15} />
								) : (
									<IconArrowUp size={15} />
								)}
							</UnstyledButton>
						</th>
						<th scope='col'>Статус</th>
						<th scope='col'>Дата оплаты</th>
						<th scope='col' className={classes.numeric}>
							Просрочка
						</th>
						<th scope='col'>
							<VisuallyHidden>Действия</VisuallyHidden>
						</th>
					</tr>
				</thead>
				<tbody>
					{mergeByDue(occurrences, planned, order).map((entry) => {
						if (entry.kind === 'planned') {
							return (
								<PlannedRow
									key={entry.key}
									entry={entry}
									today={today}
									showPayment={showPayment}
								/>
							);
						}

						const { occurrence } = entry;
						const status = occurrenceStatus(
							occurrence,
							today,
							reminderDaysBefore
						);
						const saving = pendingId === occurrence.id;

						return (
							<tr key={occurrence.id}>
								{showPayment && (
									<td>
										<div className={classes.name}>
											{occurrence.recurringPayment.name}
											<StoppedBadge
												stopped={occurrence.recurringPayment.stopped}
											/>
										</div>
										<div className={classes.muted}>
											{occurrence.department?.name ?? 'Без отдела'}
										</div>
									</td>
								)}
								<td className={`${classes.numeric} ${classes.amount}`}>
									{formatMoney(occurrence.amountMinor, occurrence.currency)}
								</td>
								<td className={classes.due}>
									{formatDate(occurrence.dueDate)}
								</td>
								<td>
									<span className={classes.status}>
										<StatusMark tone={status.tone} />
										<span className={classes.statusText}>
											<span className={TONE_CLASS[status.tone]}>
												{status.label}
											</span>
											{status.hint && (
												<span className={classes.muted}>{status.hint}</span>
											)}
										</span>
									</span>
								</td>
								<td>
									{occurrence.paidOn ? (
										<div className={classes.statusText}>
											<span className={classes.due}>
												{formatDate(occurrence.paidOn)}
											</span>
											<span
												className={`${classes.muted} ${classes.paidBy}`}
												title={occurrence.paidByLogin ?? undefined}
											>
												{occurrence.paidByLogin}
											</span>
										</div>
									) : (
										<span className={classes.none}>—</span>
									)}
								</td>
								<td className={classes.numeric}>
									{status.lateDays === null ? (
										<span className={classes.none}>—</span>
									) : (
										<div className={classes.statusText}>
											<span
												className={
													status.tone === 'overdue'
														? classes.lateDays
														: classes.due
												}
											>
												{status.lateDays}&nbsp;дн.
											</span>
											{status.tone === 'late' && (
												<span className={classes.muted}>оплачено позже</span>
											)}
										</div>
									)}
								</td>
								<td>
									<div className={classes.actions}>
										{!occurrence.paid && (
											<MarkButton
												occurrence={occurrence}
												saving={saving}
												onMark={handlers.onMark}
											/>
										)}
										<OccurrenceMenu
											occurrence={occurrence}
											disabled={saving}
											onPickDate={handlers.onPickDate}
											onUnmark={handlers.onUnmark}
										/>
									</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
