import { Button, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { DatePicker, type DatesRangeValue, MonthPicker } from '@mantine/dates';
import { useState } from 'react';

import {
	addDays,
	addMonths,
	type CalendarDate,
	endOfMonth,
	startOfMonth,
} from '@shared/lib/dates';

import { defaultPeriod, type Period } from '../model/payments-search';

type Mode = Period['kind'];

type Range = DatesRangeValue<string>;

interface Preset {
	label: string;
	period: Period;
}

function presets(mode: Mode, today: CalendarDate): Preset[] {
	const month = startOfMonth(today);

	switch (mode) {
		case 'months':
			return [
				{ label: 'Этот и следующий', period: defaultPeriod(today) },
				{
					label: 'Этот месяц',
					period: { kind: 'months', from: month, to: endOfMonth(today) },
				},
				{
					label: 'Прошлый месяц',
					period: {
						kind: 'months',
						from: addMonths(today, -1),
						to: endOfMonth(addMonths(today, -1)),
					},
				},
				{
					label: 'Следующий месяц',
					period: {
						kind: 'months',
						from: addMonths(today, 1),
						to: endOfMonth(addMonths(today, 1)),
					},
				},
			];

		case 'date':
			return [
				{ label: 'Сегодня', period: { kind: 'date', to: today } },
				{
					label: 'Конец месяца',
					period: { kind: 'date', to: endOfMonth(today) },
				},
				{
					label: 'Конец следующего',
					period: { kind: 'date', to: endOfMonth(addMonths(today, 1)) },
				},
				{
					label: 'Конец года',
					period: { kind: 'date', to: `${today.slice(0, 4)}-12-31` },
				},
			];

		case 'range':
			return [
				{
					label: 'Прошлый и этот месяц',
					period: {
						kind: 'range',
						from: addMonths(today, -1),
						to: endOfMonth(today),
					},
				},
				{
					label: 'Следующие 30 дней',
					period: { kind: 'range', from: today, to: addDays(today, 30) },
				},
				{
					label: 'С начала года',
					period: {
						kind: 'range',
						from: `${today.slice(0, 4)}-01-01`,
						to: today,
					},
				},
			];
	}
}

function draftOf(period: Period, mode: Mode): Range {
	if (period.kind !== mode) {
		return [null, null];
	}

	if (period.kind === 'date') {
		return [null, period.to];
	}

	return [
		period.from,
		period.kind === 'months' && period.to
			? startOfMonth(period.to)
			: (period.to ?? null),
	];
}

function toPeriod(mode: Mode, [from, to]: Range): Period | null {
	if (mode === 'date') {
		return to ? { kind: 'date', to } : null;
	}

	if (!from) {
		return null;
	}

	if (mode === 'months') {
		return { kind: 'months', from, to: endOfMonth(to ?? from) };
	}

	return to ? { kind: 'range', from, to } : null;
}

const HINTS: Record<Mode, string | null> = {
	months: null,
	date: 'Все периоды со сроком по\u00a0выбранную дату, в\u00a0том числе прошлые месяцы.',
	range: 'Периоды со сроком в\u00a0выбранных датах.',
};

/** Окно выбора периода: месяцы, «на дату» или свой период; выбор применяется кнопкой. */
export function PeriodPicker({
	period,
	today,
	onApply,
	onCancel,
	phone = false,
}: {
	period: Period;
	today: CalendarDate;
	onApply: (period: Period) => void;
	onCancel: () => void;
	/** На телефоне окно во всю ширину, календарь периода в одну колонку. */
	phone?: boolean;
}) {
	const [mode, setMode] = useState<Mode>(period.kind);
	const [draft, setDraft] = useState<Range>(() => draftOf(period, period.kind));
	const chosen = toPeriod(mode, draft);
	const hint = HINTS[mode];

	const switchMode = (next: Mode) => {
		setMode(next);
		setDraft(draftOf(period, next));
	};

	return (
		<Stack gap='sm' w={phone ? '100%' : mode === 'range' ? 560 : 300}>
			<SegmentedControl
				fullWidth
				aria-label='Вид периода'
				value={mode}
				onChange={(value) => switchMode(value as Mode)}
				data={[
					{ value: 'months', label: 'Месяц' },
					{ value: 'date', label: 'На дату' },
					{ value: 'range', label: 'Период' },
				]}
			/>
			<Group gap={6}>
				{presets(mode, today).map(({ label, period: preset }) => (
					<Button
						key={label}
						size='compact-sm'
						variant='default'
						onClick={() => onApply(preset)}
					>
						{label}
					</Button>
				))}
			</Group>
			{mode === 'months' && (
				<MonthPicker
					type='range'
					fullWidth={phone}
					size={phone ? 'lg' : undefined}
					allowSingleDateInRange
					value={draft}
					onChange={setDraft}
					defaultDate={draft[0] ?? today}
				/>
			)}
			{mode === 'date' && (
				<DatePicker
					fullWidth={phone}
					size={phone ? 'lg' : undefined}
					value={draft[1]}
					onChange={(to) => setDraft([null, to])}
					defaultDate={draft[1] ?? today}
				/>
			)}
			{mode === 'range' && (
				<DatePicker
					type='range'
					fullWidth={phone}
					size={phone ? 'lg' : undefined}
					allowSingleDateInRange
					numberOfColumns={phone ? 1 : 2}
					value={draft}
					onChange={setDraft}
					defaultDate={draft[0] ?? addMonths(today, -1)}
				/>
			)}
			{hint && (
				<Text size='xs' c='dimmed'>
					{hint}
				</Text>
			)}
			<Group justify='flex-end' gap='xs'>
				<Button variant='subtle' color='gray' onClick={onCancel}>
					Отмена
				</Button>
				<Button disabled={!chosen} onClick={() => chosen && onApply(chosen)}>
					Применить
				</Button>
			</Group>
		</Stack>
	);
}
