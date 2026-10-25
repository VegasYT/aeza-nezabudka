import { Button, Text } from '@mantine/core';

import {
	occurrenceStatus,
	StatusMark,
	TONE_CLASS,
} from '@entities/payment-occurrence';
import type { PaymentOccurrence } from '@shared/api';
import { type CalendarDate, daysBetween, formatDate } from '@shared/lib/dates';
import { formatMoney } from '@shared/lib/money';
import { formatDays } from '@shared/lib/plural';
import { IconCheck } from '@shared/ui/icons';

import {
	type CalendarEntry,
	entryName,
	entrySource,
	plannedNote,
} from '../lib/calendar';
import classes from './payments-views.module.css';

/** «Сегодня» сервера и окно напоминания: от них зависит статус периода. */
export interface StatusSettings {
	today: CalendarDate;
	reminderDaysBefore: number;
}

/** Значок периода «по расписанию»: пунктирный круг с часами. */
export function PlannedMark({ size = 18 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox='0 0 20 20'
			aria-hidden='true'
			className={classes.plannedMark}
		>
			<circle
				cx='10'
				cy='10'
				r='8.25'
				fill='none'
				stroke='currentColor'
				strokeWidth='1.6'
				strokeDasharray='2.6 2.2'
			/>
			<path
				d='M10 6.2v4l2.6 1.6'
				fill='none'
				stroke='currentColor'
				strokeWidth='1.6'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
		</svg>
	);
}

/** Значок статуса периода календаря: созданного или планового. */
export function EntryMark({
	entry,
	settings,
}: {
	entry: CalendarEntry;
	settings: StatusSettings;
}) {
	if (entry.kind === 'planned') {
		return <PlannedMark />;
	}

	const { tone } = occurrenceStatus(
		entry.occurrence,
		settings.today,
		settings.reminderDaysBefore
	);

	return <StatusMark tone={tone} />;
}

/** Статус периода словами и подпись под ним: «Не оплачено», «срок через 26 дней». */
export function EntryStatus({
	entry,
	settings,
}: {
	entry: CalendarEntry;
	settings: StatusSettings;
}) {
	if (entry.kind === 'planned') {
		const days = daysBetween(settings.today, entry.planned.dueDate);

		return (
			<span className={classes.entryStatusText}>
				<span className={classes.plannedText}>По&nbsp;расписанию</span>
				<Text size='xs' c='dimmed'>
					срок через {formatDays(days)}
				</Text>
			</span>
		);
	}

	const { occurrence } = entry;
	const status = occurrenceStatus(
		occurrence,
		settings.today,
		settings.reminderDaysBefore
	);
	const hint = occurrence.paidOn
		? `оплачено ${formatDate(occurrence.paidOn)}`
		: status.hint;

	return (
		<span className={classes.entryStatusText}>
			<span className={TONE_CLASS[status.tone]}>{status.label}</span>
			{hint && (
				<Text size='xs' c='dimmed'>
					{hint}
				</Text>
			)}
		</span>
	);
}

/** Карточка периода: отдел, сумма, срок, статус и действие. */
export function EntryCard({
	entry,
	settings,
	pending,
	onMark,
}: {
	entry: CalendarEntry;
	settings: StatusSettings;
	pending: boolean;
	onMark: (occurrence: PaymentOccurrence) => void;
}) {
	const source = entrySource(entry);

	return (
		<div className={classes.entryCard}>
			<div className={classes.entryTitle}>
				<span className={classes.entryName}>{entryName(entry)}</span>
				<Text size='xs' c='dimmed'>
					{source.department?.name ?? 'Без отдела'}
				</Text>
			</div>
			<div className={classes.entryAmount}>
				<span className={classes.entrySum}>
					{formatMoney(source.amountMinor, source.currency)}
				</span>
				<Text size='xs' c='dimmed'>
					срок{' '}
					<span className={classes.numbers}>{formatDate(source.dueDate)}</span>
				</Text>
			</div>
			<div className={classes.entryStatus}>
				<EntryMark entry={entry} settings={settings} />
				<EntryStatus entry={entry} settings={settings} />
			</div>
			{entry.kind === 'planned' && (
				<Text size='sm' c='dimmed' className={classes.entryNote}>
					{plannedNote(entry.appearsOn)}
				</Text>
			)}
			{entry.kind === 'created' && !entry.occurrence.paid && (
				<Button
					size='sm'
					variant='light'
					loading={pending}
					leftSection={<IconCheck size={16} />}
					onClick={() => onMark(entry.occurrence)}
				>
					Оплачено
				</Button>
			)}
		</div>
	);
}
