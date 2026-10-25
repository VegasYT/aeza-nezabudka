import { Popover, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { useState } from 'react';

import { StatusMark } from '@entities/payment-occurrence';
import type { PaymentOccurrence, PlannedOccurrence } from '@shared/api';
import { type CalendarDate, formatDate } from '@shared/lib/dates';
import { formatDays } from '@shared/lib/plural';

import {
	type CalendarEntry,
	entriesByDay,
	entryName,
	monthWeeks,
	shortAmount,
} from '../lib/calendar';
import { formatPeriods } from '../model/wording';
import {
	EntryCard,
	EntryMark,
	PlannedMark,
	type StatusSettings,
} from './calendar-entry';
import classes from './payments-views.module.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface CalendarProps {
	months: CalendarDate[];
	occurrences: PaymentOccurrence[];
	planned: PlannedOccurrence[];
	settings: StatusSettings;
	/** Подпись месяцев: «Ноябрь 2026». */
	monthTitle: (month: CalendarDate) => string;
	pendingId: string | null;
	onMark: (occurrence: PaymentOccurrence) => void;
}

function Chip({
	entry,
	settings,
	open,
	pending,
	onToggle,
	onMark,
}: {
	entry: CalendarEntry;
	settings: StatusSettings;
	open: boolean;
	pending: boolean;
	onToggle: (open: boolean) => void;
	onMark: (occurrence: PaymentOccurrence) => void;
}) {
	const name = entryName(entry);
	const amount = shortAmount(entry);

	return (
		<Popover
			opened={open}
			onChange={onToggle}
			position='bottom-start'
			width={288}
			trapFocus
			withinPortal
		>
			<Popover.Target>
				<UnstyledButton
					className={
						entry.kind === 'planned' ? classes.chipPlanned : classes.chip
					}
					aria-expanded={open}
					aria-label={`${name}, ${amount}${entry.kind === 'planned' ? ', по\u00a0расписанию' : ''}`}
					onClick={() => onToggle(!open)}
				>
					<EntryMark entry={entry} settings={settings} />
					<span className={classes.chipName}>{name}</span>
					<span className={classes.chipAmount}>{amount}</span>
				</UnstyledButton>
			</Popover.Target>
			<Popover.Dropdown>
				<EntryCard
					entry={entry}
					settings={settings}
					pending={pending}
					onMark={(occurrence) => {
						onToggle(false);
						onMark(occurrence);
					}}
				/>
			</Popover.Dropdown>
		</Popover>
	);
}

/** Календарь оплат: месяцы сеткой с понедельника, в дне - периоды, плановые пунктиром. */
export function CalendarView({
	months,
	occurrences,
	planned,
	settings,
	monthTitle,
	pendingId,
	onMark,
}: CalendarProps) {
	const days = entriesByDay(occurrences, planned);
	const [openKey, setOpenKey] = useState<string | null>(null);

	return (
		<div className={classes.calendar}>
			{months.map((month) => (
				<section
					key={month}
					aria-label={monthTitle(month)}
					className={classes.month}
				>
					{months.length > 1 && (
						<h3 className={classes.monthTitle}>{monthTitle(month)}</h3>
					)}
					<div className={classes.grid}>
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
							.map((day, index) =>
								day === null ? (
									<div key={`${month}-${index}`} aria-hidden='true' />
								) : (
									<div
										key={day}
										className={classes.cell}
										data-today={day === settings.today || undefined}
									>
										<span className={classes.dayNumber}>
											<VisuallyHidden>{formatDate(day)}</VisuallyHidden>
											<span aria-hidden='true'>{Number(day.slice(8, 10))}</span>
										</span>
										{(days.get(day) ?? []).map((entry) => (
											<Chip
												key={entry.key}
												entry={entry}
												settings={settings}
												open={openKey === entry.key}
												pending={
													entry.kind === 'created' &&
													pendingId === entry.occurrence.id
												}
												onToggle={(open) => setOpenKey(open ? entry.key : null)}
												onMark={onMark}
											/>
										))}
									</div>
								)
							)}
					</div>
				</section>
			))}
		</div>
	);
}

/** Обозначения календаря и число периодов, из них по расписанию. */
export function CalendarLegend({
	reminderDaysBefore,
	total,
	planned,
	phrase,
}: {
	reminderDaysBefore: number;
	total: number;
	planned: number;
	phrase: string;
}) {
	const items = [
		{ mark: <StatusMark tone='paid' />, label: 'Оплачено' },
		{
			mark: <StatusMark tone='soon' />,
			label: `Срок в\u00a0ближайшие ${formatDays(reminderDaysBefore)}`,
		},
		{ mark: <StatusMark tone='waiting' />, label: 'Не оплачено' },
		{ mark: <StatusMark tone='overdue' />, label: 'Просрочено' },
		{
			mark: <PlannedMark />,
			label: 'По\u00a0расписанию, период ещё не\u00a0появился',
		},
	];

	return (
		<div className={classes.legendRow}>
			<ul aria-label='Обозначения' className={classes.legend}>
				{items.map(({ mark, label }) => (
					<li key={label} className={classes.legendItem}>
						{mark}
						{label}
					</li>
				))}
			</ul>
			<span className={classes.count}>
				{formatPeriods(total)} {phrase}
				{planned > 0 && `, из\u00a0них ${planned}\u00a0по\u00a0расписанию`}
			</span>
		</div>
	);
}
