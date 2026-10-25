import {
	ActionIcon,
	Button,
	Drawer,
	Group,
	Popover,
	SegmentedControl,
	Select,
} from '@mantine/core';
import { useState } from 'react';

import type { Department } from '@shared/api';
import { type CalendarDate, formatDate } from '@shared/lib/dates';
import { AddButton } from '@shared/ui/add-button';
import {
	IconCalendar,
	IconChevronLeft,
	IconChevronRight,
	IconClose,
	IconTable,
	IconWallet,
} from '@shared/ui/icons';
import { PageTitle } from '@shared/ui/page-title';

import {
	defaultPeriod,
	type PaymentsView,
	type Period,
	periodLabel,
	shiftPeriod,
} from '../model/payments-search';
import classes from './payments-page.module.css';
import { PeriodPicker } from './period-picker';
import { FiltersButton, PhonePeriodBar } from './phone-payments';

const ALL = 'all';

/** Вид экрана, включая таблицу по умолчанию. */
export type ScreenView = PaymentsView | 'table';

const VIEWS = [
	{ value: 'table', label: 'Таблица', icon: IconTable },
	{ value: 'calendar', label: 'Календарь', icon: IconCalendar },
	{ value: 'budget', label: 'Бюджет', icon: IconWallet },
] as const;

function ViewSwitch({
	view,
	phone,
	onView,
}: {
	view: ScreenView;
	phone: boolean;
	onView: (view: ScreenView) => void;
}) {
	return (
		<SegmentedControl
			aria-label='Вид'
			size={phone ? 'md' : 'sm'}
			fullWidth={phone}
			className={phone ? classes.phoneViews : undefined}
			value={view}
			onChange={(value) => onView(value as ScreenView)}
			data={VIEWS.map(({ value, label, icon: Icon }) => ({
				value,
				label: (
					<span className={classes.viewLabel}>
						<Icon size={phone ? 18 : 16} />
						{label}
					</span>
				),
			}))}
		/>
	);
}

/** Год бюджета со стрелками: в бюджете он заменяет период. */
function YearStepper({
	year,
	phone,
	onYear,
}: {
	year: number;
	phone: boolean;
	onYear: (year: number) => void;
}) {
	const size = phone ? 44 : 'lg';

	return (
		<Group
			gap={2}
			wrap='nowrap'
			className={phone ? classes.phonePeriod : undefined}
		>
			<ActionIcon
				variant='subtle'
				color='gray'
				size={size}
				aria-label='Предыдущий год'
				onClick={() => onYear(year - 1)}
			>
				<IconChevronLeft />
			</ActionIcon>
			<span className={classes.year} aria-live='polite'>
				<IconCalendar size={18} />
				{year}&nbsp;год
			</span>
			<ActionIcon
				variant='subtle'
				color='gray'
				size={size}
				aria-label='Следующий год'
				onClick={() => onYear(year + 1)}
			>
				<IconChevronRight />
			</ActionIcon>
		</Group>
	);
}

/** Заголовок экрана, отдел и период: они задают выборку и для итогов, и для списка. */
export function PaymentsToolbar({
	today,
	period,
	dept,
	departments,
	onPeriod,
	onDept,
	phone,
	filterCount,
	onFilters,
	onAdd,
	view,
	year,
	onView,
	onYear,
}: {
	today: CalendarDate;
	period: Period;
	dept: string | undefined;
	departments: Department[];
	onPeriod: (period: Period) => void;
	onDept: (dept: string | undefined) => void;
	/** Телефон: период на всю ширину, отдел и валюта в листе фильтров. */
	phone: boolean;
	filterCount: number;
	onFilters: () => void;
	/** Только у администратора: открыть форму нового платежа. */
	onAdd?: () => void;
	view: ScreenView;
	/** Год бюджета. */
	year: number;
	onView: (view: ScreenView) => void;
	onYear: (year: number) => void;
}) {
	const [picking, setPicking] = useState(false);
	const apply = (next: Period) => {
		setPicking(false);
		onPeriod(next);
	};
	const title = (
		<PageTitle note={`сегодня ${formatDate(today)}`}>Платежи</PageTitle>
	);

	if (phone) {
		return (
			<div className={classes.phoneToolbar}>
				<div className={classes.phoneTitleRow}>
					{title}
					<Group gap={6} wrap='nowrap'>
						{onAdd && <AddButton label='Добавить платёж' onClick={onAdd} />}
						<FiltersButton count={filterCount} onClick={onFilters} />
					</Group>
				</div>
				<ViewSwitch view={view} phone onView={onView} />
				{view === 'budget' ? (
					<YearStepper year={year} phone onYear={onYear} />
				) : (
					<PhonePeriodBar
						today={today}
						period={period}
						onPeriod={onPeriod}
						picker={
							<Button
								variant='default'
								flex={1}
								leftSection={<IconCalendar size={18} />}
								aria-label={`Период: ${periodLabel(period)}`}
								onClick={() => setPicking(true)}
							>
								{periodLabel(period)}
							</Button>
						}
					/>
				)}
				<Drawer
					opened={picking}
					onClose={() => setPicking(false)}
					position='bottom'
					classNames={{ content: classes.sheet }}
					title='Период'
				>
					<PeriodPicker
						phone
						period={period}
						today={today}
						onApply={apply}
						onCancel={() => setPicking(false)}
					/>
				</Drawer>
			</div>
		);
	}

	return (
		<div className={classes.toolbar}>
			{title}
			<div className={classes.controls}>
				<ViewSwitch view={view} phone={false} onView={onView} />
				<Select
					aria-label='Отдел'
					w={200}
					allowDeselect={false}
					value={dept ?? ALL}
					onChange={(value) =>
						onDept(value === ALL || value === null ? undefined : value)
					}
					data={[
						{ value: ALL, label: 'Все отделы' },
						...departments.map(({ id, name }) => ({ value: id, label: name })),
						{ value: 'none', label: 'Без отдела' },
					]}
				/>
				{view === 'budget' ? (
					<YearStepper year={year} phone={false} onYear={onYear} />
				) : (
					<Group gap={2} wrap='nowrap'>
						{period.kind === 'months' && (
							<ActionIcon
								variant='subtle'
								color='gray'
								size='lg'
								aria-label='На месяц раньше'
								onClick={() => onPeriod(shiftPeriod(period, -1))}
							>
								<IconChevronLeft />
							</ActionIcon>
						)}
						<Popover
							opened={picking}
							onChange={setPicking}
							position='bottom-end'
							trapFocus
						>
							<Popover.Target>
								<Button
									variant='default'
									className={classes.periodButton}
									leftSection={<IconCalendar size={18} />}
									aria-label={`Период: ${periodLabel(period)}`}
									onClick={() => setPicking((open) => !open)}
								>
									{periodLabel(period)}
								</Button>
							</Popover.Target>
							<Popover.Dropdown>
								<PeriodPicker
									period={period}
									today={today}
									onApply={apply}
									onCancel={() => setPicking(false)}
								/>
							</Popover.Dropdown>
						</Popover>
						{period.kind === 'months' ? (
							<ActionIcon
								variant='subtle'
								color='gray'
								size='lg'
								aria-label='На месяц позже'
								onClick={() => onPeriod(shiftPeriod(period, 1))}
							>
								<IconChevronRight />
							</ActionIcon>
						) : (
							<ActionIcon
								variant='subtle'
								color='gray'
								size='lg'
								aria-label={'Вернуть этот и\u00a0следующий месяц'}
								onClick={() => onPeriod(defaultPeriod(today))}
							>
								<IconClose />
							</ActionIcon>
						)}
					</Group>
				)}
				{onAdd && <AddButton label='Добавить платёж' onClick={onAdd} />}
			</div>
		</div>
	);
}
