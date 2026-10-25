import {
	Anchor,
	SegmentedControl,
	Skeleton,
	Table,
	Text,
	Title,
	VisuallyHidden,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';

import { StatusMark } from '@entities/payment-occurrence';
import type {
	Currency,
	CurrencyTotals,
	MonthTotals,
	PaymentsSummary,
} from '@shared/api';
import { type CalendarDate, endOfMonth } from '@shared/lib/dates';
import { currencySign, formatAmount, formatMoney } from '@shared/lib/money';
import { Island } from '@shared/ui/island';
import { LoadError } from '@shared/ui/list-state';

import { type MonthKind, monthState, planOf, yearPeriods } from '../lib/budget';
import {
	monthName,
	type PaymentsSearch,
	periodSearch,
} from '../model/payments-search';
import { useBudget } from '../model/views-queries';
import { formatPeriods } from '../model/wording';
import { PlannedMark } from './calendar-entry';
import classes from './payments-views.module.css';

const CURRENCIES: { code: Currency; title: string; aria: string }[] = [
	{ code: 'RUB', title: 'рубли', aria: 'в рублях' },
	{ code: 'USD', title: 'доллары', aria: 'в долларах' },
	{ code: 'EUR', title: 'евро', aria: 'в евро' },
];

const MONTH_MARKS: Record<MonthKind, ReactNode> = {
	none: null,
	paid: <StatusMark tone='paid' />,
	overdue: <StatusMark tone='overdue' />,
	planned: <PlannedMark />,
	waiting: <StatusMark tone='waiting' />,
};

interface BudgetProps {
	year: number;
	today: CalendarDate;
	summary: PaymentsSummary | undefined;
	loading: boolean;
	error: boolean;
	onRetry: () => void;
	/** Адрес таблицы за месяц `month`. */
	monthSearch: (month: CalendarDate) => PaymentsSearch;
}

function totalsOf(
	currencies: readonly CurrencyTotals[] | undefined,
	code: Currency
) {
	return currencies?.find((totals) => totals.currency === code);
}

function monthStart(month: MonthTotals): CalendarDate {
	return `${month.month}-01`;
}

/** Карточка валюты: план года вместе с плановыми, из него оплачено, просрочено и предстоит. */
function PlanCard({
	code,
	title,
	aria,
	year,
	totals,
}: {
	code: Currency;
	title: string;
	aria: string;
	year: number;
	totals: CurrencyTotals | undefined;
}) {
	const plan = totals ? planOf(totals) : null;

	return (
		<Island
			className={classes.planCard}
			aria-label={`План ${aria} на ${year} год`}
		>
			<div className={classes.planHead}>
				<span>
					<span className={classes.code}>{code}</span>{' '}
					<Text span size='xs' c='dimmed'>
						{title}
					</Text>
				</span>
				{plan && plan.count > 0 && (
					<Text span size='xs' c='dimmed'>
						{formatPeriods(plan.count)}
					</Text>
				)}
			</div>
			{!plan || plan.count === 0 ? (
				<Text size='sm' c='dimmed' className={classes.planNone}>
					Нет периодов за&nbsp;{year}&nbsp;год
				</Text>
			) : (
				<>
					<div className={classes.planSum}>
						<Text size='xs' c='dimmed'>
							План на&nbsp;{year}&nbsp;год
						</Text>
						<span className={classes.planAmount}>
							{formatAmount(plan.plan)}
							<span className={classes.planSign}>
								&nbsp;{currencySign(code)}
							</span>
						</span>
					</div>
					<Legend code={code} plan={plan} />
				</>
			)}
		</Island>
	);
}

function Legend({
	code,
	plan,
}: {
	code: Currency;
	plan: ReturnType<typeof planOf>;
}) {
	const parts = [
		{ label: 'Оплачено', value: plan.paid, tone: classes.barPaid },
		{ label: 'Просрочено', value: plan.overdue, tone: classes.barOverdue },
		{ label: 'Предстоит', value: plan.upcoming, tone: classes.barWaiting },
	];

	return (
		<>
			<div className={classes.bar} aria-hidden='true'>
				{parts.map(({ label, value, tone }) =>
					value > 0 ? (
						<span
							key={label}
							className={tone}
							style={{ flex: `${value} 1 0` }}
						/>
					) : null
				)}
			</div>
			<div className={classes.barLegend}>
				{parts.map(({ label, value, tone }) => (
					<span key={label} className={classes.barLegendItem}>
						<span className={`${classes.barDot} ${tone}`} aria-hidden='true' />
						{label}{' '}
						<span
							className={
								label === 'Просрочено' && value > 0
									? classes.overdueAmount
									: classes.legendAmount
							}
						>
							{formatAmount(value)}
						</span>
						<VisuallyHidden> {currencySign(code)}</VisuallyHidden>
					</span>
				))}
			</div>
		</>
	);
}

function MonthLink({
	month,
	search,
	className,
	children,
}: {
	month: CalendarDate;
	search: PaymentsSearch;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Anchor
			className={className}
			aria-label={`${monthName(month)}: открыть периоды месяца`}
			renderRoot={(props) => <Link to='/payments' search={search} {...props} />}
		>
			{children}
		</Anchor>
	);
}

/** Бюджет на год: план по валютам и таблица месяцев с плановыми суммами. */
export function BudgetView({
	year,
	today,
	summary,
	loading,
	error,
	onRetry,
	monthSearch,
}: BudgetProps) {
	if (error && !summary) {
		return (
			<Island className={classes.budgetIsland}>
				<LoadError title='Не удалось загрузить бюджет' onRetry={onRetry} />
			</Island>
		);
	}

	const currentMonth = today.slice(0, 7);

	return (
		<>
			<section aria-label={`План на ${year} год`} className={classes.planCards}>
				{CURRENCIES.map(({ code, title, aria }) =>
					loading ? (
						<Island key={code} className={classes.planCard}>
							<Skeleton height={12} width={70} />
							<Skeleton height={28} width='58%' />
							<Skeleton height={6} />
						</Island>
					) : (
						<PlanCard
							key={code}
							code={code}
							title={title}
							aria={aria}
							year={year}
							totals={totalsOf(summary?.currencies, code)}
						/>
					)
				)}
			</section>
			<Island aria-labelledby='budget-months' className={classes.budgetIsland}>
				<Title order={2} id='budget-months' className={classes.budgetTitle}>
					По&nbsp;месяцам
				</Title>
				<div className={classes.tableBox}>
					<Table className={classes.budgetTable} verticalSpacing='sm'>
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Месяц</Table.Th>
								{CURRENCIES.map(({ code }) => (
									<Table.Th key={code} className={classes.sumColumn}>
										{code}, {currencySign(code)}
									</Table.Th>
								))}
								<Table.Th className={classes.periodsColumn}>Периоды</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{(summary?.months ?? []).map((month) => {
								const start = monthStart(month);
								const state = monthState(month.currencies);
								const current = month.month === currentMonth;
								const future = month.month > currentMonth;

								return (
									<Table.Tr
										key={month.month}
										className={current ? classes.currentMonth : undefined}
									>
										<Table.Th scope='row' className={classes.monthCell}>
											<MonthLink
												month={start}
												search={monthSearch(start)}
												className={
													state.kind === 'none'
														? classes.monthEmpty
														: classes.monthName
												}
											>
												{monthName(start)}
											</MonthLink>
											{current && (
												<span className={classes.currentBadge}>текущий</span>
											)}
										</Table.Th>
										{CURRENCIES.map(({ code }) => {
											const totals = totalsOf(month.currencies, code);
											const plan = totals ? planOf(totals) : null;

											return (
												<Table.Td
													key={code}
													className={
														!plan || plan.count === 0
															? classes.sumEmpty
															: future
																? classes.sumFuture
																: classes.sum
													}
												>
													{!plan || plan.count === 0
														? '—'
														: formatAmount(plan.plan)}
												</Table.Td>
											);
										})}
										<Table.Td className={classes.periodsCell}>
											<span className={classes.periodsState}>
												<span className={classes.periodsMark}>
													{MONTH_MARKS[state.kind]}
												</span>
												{state.text}
												{state.warn && (
													<span className={classes.warn}> {state.warn}</span>
												)}
											</span>
										</Table.Td>
									</Table.Tr>
								);
							})}
						</Table.Tbody>
						{summary && (
							<Table.Tfoot>
								<Table.Tr className={classes.totalRow}>
									<Table.Th scope='row' className={classes.totalLabel}>
										Итого за&nbsp;{year}
									</Table.Th>
									{CURRENCIES.map(({ code }) => {
										const totals = totalsOf(summary.currencies, code);

										return (
											<Table.Td key={code} className={classes.totalSum}>
												{totals ? formatAmount(planOf(totals).plan) : '—'}
											</Table.Td>
										);
									})}
									<Table.Td className={classes.periodsCell}>
										{yearPeriods(summary.currencies)}
									</Table.Td>
								</Table.Tr>
							</Table.Tfoot>
						)}
					</Table>
				</div>
				<Text size='xs' c='dimmed' className={classes.budgetNote}>
					Суммы периодов по&nbsp;сроку, без конвертации валют. Будущие месяцы
					посчитаны по&nbsp;расписанию действующих платежей
					и&nbsp;пересчитаются, если платёж изменят или прекратят.
				</Text>
			</Island>
		</>
	);
}

/** Бюджет на телефоне: выбор валюты, карточка плана и месяцы списком. */
export function PhoneBudget({
	year,
	today,
	summary,
	loading,
	error,
	onRetry,
	monthSearch,
}: BudgetProps) {
	const firstWithPeriods =
		CURRENCIES.find(({ code }) => {
			const totals = totalsOf(summary?.currencies, code);

			return totals && planOf(totals).count > 0;
		})?.code ?? 'RUB';
	const [picked, setPicked] = useState<Currency | null>(null);
	const code = picked ?? firstWithPeriods;
	const meta = CURRENCIES.find((item) => item.code === code) ?? CURRENCIES[0];

	if (error && !summary) {
		return (
			<Island className={classes.budgetIsland}>
				<LoadError title='Не удалось загрузить бюджет' onRetry={onRetry} />
			</Island>
		);
	}

	const months = (summary?.months ?? []).map((month) => {
		const totals = totalsOf(month.currencies, code);

		return { month, totals, plan: totals ? planOf(totals) : null };
	});
	const first = months.findIndex(({ plan }) => plan && plan.count > 0);
	const shown = first < 0 ? [] : months.slice(first);
	const beforeFirst = first > 0 ? months[first - 1]?.month : undefined;
	const currentMonth = today.slice(0, 7);
	const yearTotals = totalsOf(summary?.currencies, code);

	return (
		<>
			<SegmentedControl
				aria-label='Валюта'
				fullWidth
				size='md'
				value={code}
				onChange={(value) => setPicked(value as Currency)}
				data={CURRENCIES.map((item) => item.code)}
			/>
			{loading ? (
				<Island className={classes.planCard}>
					<Skeleton height={28} width='58%' />
				</Island>
			) : (
				meta && (
					<PlanCard
						code={code}
						title={meta.title}
						aria={meta.aria}
						year={year}
						totals={yearTotals}
					/>
				)
			)}
			<Island aria-label='По месяцам' className={classes.phoneMonths}>
				{beforeFirst && (
					<Text size='sm' c='dimmed' className={classes.phoneMonthsEmpty}>
						С&nbsp;января по&nbsp;
						{monthName(monthStart(beforeFirst)).toLowerCase()} периодов нет
					</Text>
				)}
				{shown.map(({ month, totals, plan }) => {
					const start = monthStart(month);
					const state = monthState(totals ? [totals] : []);

					return (
						<MonthLink
							key={month.month}
							month={start}
							search={monthSearch(start)}
							className={
								month.month === currentMonth
									? `${classes.phoneMonthRow} ${classes.currentMonth}`
									: classes.phoneMonthRow
							}
						>
							<span className={classes.phoneMonthMain}>
								<span className={classes.periodsMark}>
									{MONTH_MARKS[state.kind]}
								</span>
								<span className={classes.phoneMonthText}>
									<span className={classes.phoneMonthName}>
										{monthName(start)}
									</span>
									{state.kind !== 'none' && (
										<span
											className={
												state.warn ? classes.warn : classes.phoneMonthNote
											}
										>
											{state.warn ? `${state.text} ${state.warn}` : state.text}
										</span>
									)}
								</span>
							</span>
							<span className={classes.phoneMonthSum}>
								{plan && plan.count > 0 ? formatMoney(plan.plan, code) : '—'}
							</span>
						</MonthLink>
					);
				})}
				<div className={classes.phoneYearTotal}>
					<span className={classes.budgetTitle}>Итого за&nbsp;{year}</span>
					<span className={classes.totalSum}>
						{yearTotals ? formatMoney(planOf(yearTotals).plan, code) : '—'}
					</span>
				</div>
			</Island>
		</>
	);
}

/** Бюджет за год экрана: на компьютере таблица месяцев, на телефоне - список с выбором валюты. */
export function BudgetScreen({
	search,
	today,
	year,
	phone,
}: {
	search: PaymentsSearch;
	today: CalendarDate;
	year: number;
	phone: boolean;
}) {
	const budget = useBudget(search.dept, year);
	// Месяц бюджета открывается таблицей: вид и год из адреса убираются.
	const monthSearch = (month: CalendarDate): PaymentsSearch => ({
		...search,
		page: undefined,
		view: undefined,
		year: undefined,
		...periodSearch(
			{ kind: 'months', from: month, to: endOfMonth(month) },
			today
		),
	});
	const props = {
		year,
		today,
		summary: budget.data,
		loading: budget.isPending,
		error: budget.isError,
		onRetry: () => void budget.refetch(),
		monthSearch,
	};

	return phone ? <PhoneBudget {...props} /> : <BudgetView {...props} />;
}
