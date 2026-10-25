import { Text, UnstyledButton } from '@mantine/core';
import { useState } from 'react';

import {
	occurrenceStatus,
	type StatusTone,
} from '@entities/payment-occurrence';
import type { PaymentOccurrence, PlannedOccurrence } from '@shared/api';
import { type CalendarDate, startOfMonth } from '@shared/lib/dates';
import { plural } from '@shared/lib/plural';

import {
	type CalendarEntry,
	entriesByDay,
	entryName,
	monthWeeks,
	plannedNote,
	shortAmount,
} from '../lib/calendar';
import { formatDayMonth } from '../model/payments-search';
import {
	EntryStatus,
	PlannedMark,
	type StatusSettings,
} from './calendar-entry';
import { OccurrenceCards } from './phone-payments';
import classes from './payments-views.module.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const DOT_CLASS: Record<StatusTone | 'planned', string | undefined> = {
	paid: classes.dotPaid,
	late: classes.dotPaid,
	overdue: classes.dotOverdue,
	soon: classes.dotSoon,
	waiting: classes.dotWaiting,
	planned: classes.dotPlanned,
};

function dotOf(entry: CalendarEntry, settings: StatusSettings) {
	return entry.kind === 'planned'
		? 'planned'
		: occurrenceStatus(
				entry.occurrence,
				settings.today,
				settings.reminderDaysBefore
			).tone;
}

function paymentsCount(count: number) {
	return count === 0
		? 'платежей нет'
		: plural(count, 'платёж', 'платежа', 'платежей');
}

interface PhoneCalendarProps {
	months: CalendarDate[];
	occurrences: PaymentOccurrence[];
	planned: PlannedOccurrence[];
	settings: StatusSettings;
	monthTitle: (month: CalendarDate) => string;
	pendingId: string | null;
	onMark: (occurrence: PaymentOccurrence) => void;
	onOpenActions: (occurrence: PaymentOccurrence) => void;
}

/** Календарь на телефоне: сетка месяца с точками статусов и периоды выбранного дня. */
export function PhoneCalendar({
	months,
	occurrences,
	planned,
	settings,
	monthTitle,
	pendingId,
	onMark,
	onOpenActions,
}: PhoneCalendarProps) {
	const days = entriesByDay(occurrences, planned);
	const fallback = months.includes(startOfMonth(settings.today))
		? settings.today
		: ([...days.keys()].sort()[0] ?? (months[0] as CalendarDate));
	const [picked, setPicked] = useState<CalendarDate | null>(null);
	const selected =
		picked && months.includes(startOfMonth(picked)) ? picked : fallback;
	const entries = days.get(selected) ?? [];
	const created = entries.flatMap((entry) =>
		entry.kind === 'created' ? [entry.occurrence] : []
	);

	return (
		<div className={classes.phoneCalendar}>
			{months.map((month) => (
				<section
					key={month}
					aria-label={monthTitle(month)}
					className={classes.phoneMonth}
				>
					<h3 className={classes.monthTitle}>{monthTitle(month)}</h3>
					<div className={classes.phoneGrid}>
						{WEEKDAYS.map((name, index) => (
							<span
								key={name}
								aria-hidden='true'
								className={index >= 5 ? classes.weekend : classes.weekday}
							>
								{name}
							</span>
						))}
						{monthWeeks(month)
							.flat()
							.map((day, index) => {
								if (day === null) {
									return <span key={`${month}-${index}`} aria-hidden='true' />;
								}

								const dayEntries = days.get(day) ?? [];

								return (
									<UnstyledButton
										key={day}
										className={classes.phoneDay}
										data-selected={day === selected || undefined}
										data-today={day === settings.today || undefined}
										aria-pressed={day === selected}
										aria-label={`${formatDayMonth(day)}: ${paymentsCount(dayEntries.length)}`}
										onClick={() => setPicked(day)}
									>
										<span className={classes.phoneDayNumber}>
											{Number(day.slice(8, 10))}
										</span>
										<span className={classes.dots} aria-hidden='true'>
											{dayEntries.slice(0, 3).map((entry) => (
												<span
													key={entry.key}
													className={`${classes.dot} ${DOT_CLASS[dotOf(entry, settings)] ?? ''}`}
												/>
											))}
										</span>
									</UnstyledButton>
								);
							})}
					</div>
					{startOfMonth(selected) === month && (
						<div className={classes.dayPanel} aria-live='polite'>
							<div className={classes.dayHead}>
								<span className={classes.dayTitle}>
									{formatDayMonth(selected)}
								</span>
								<Text size='xs' c='dimmed'>
									{paymentsCount(entries.length)}
								</Text>
							</div>
							{created.length > 0 && (
								<OccurrenceCards
									occurrences={created}
									today={settings.today}
									reminderDaysBefore={settings.reminderDaysBefore}
									pendingId={pendingId}
									onMark={onMark}
									onOpenActions={onOpenActions}
								/>
							)}
							{entries.map((entry) =>
								entry.kind === 'planned' ? (
									<div key={entry.key} className={classes.plannedRow}>
										<span className={classes.plannedRowHead}>
											<span className={classes.entryName}>
												{entryName(entry)}
											</span>
											<span className={classes.entrySumSmall}>
												{shortAmount(entry)}
											</span>
										</span>
										<span className={classes.entryStatus}>
											<PlannedMark />
											<EntryStatus entry={entry} settings={settings} />
										</span>
										<Text size='sm' c='dimmed'>
											{plannedNote(entry.appearsOn)}
										</Text>
									</div>
								) : null
							)}
						</div>
					)}
				</section>
			))}
		</div>
	);
}
