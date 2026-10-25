import { endOfMonth } from '@shared/lib/dates';
import { Island } from '@shared/ui/island';
import { LoadError } from '@shared/ui/list-state';

import { useSummary } from '../model/payments-queries';
import { monthTitle, periodPhrase } from '../model/payments-search';
import { useCalendarData } from '../model/views-queries';
import { CalendarLegend, CalendarView } from './calendar-view';
import { ListFilters, PhoneStatusFilter } from './list-filters';
import { ListSkeleton } from './list-states';
import classes from './payments-page.module.css';
import { PhoneCalendar } from './phone-calendar';
import { PhoneSummary } from './phone-payments';
import type { ScreenProps } from './screen-props';
import { SummaryCards } from './summary-cards';

/** Календарь оплат с итогами за период: месяцы сеткой, на телефоне - по дням. */
export function CalendarScreen({
	search,
	period,
	phrase,
	today,
	reminderDaysBefore,
	phone,
	filtered,
	pendingId,
	handlers,
	onOpenActions,
	update,
	resetFilters,
}: ScreenProps) {
	const summary = useSummary(search, period);
	const calendar = useCalendarData(search, period, today);
	const state = calendar.isError ? (
		<LoadError
			title='Не удалось загрузить календарь'
			onRetry={calendar.refetch}
		/>
	) : calendar.isPending ? (
		<ListSkeleton />
	) : null;
	const calendarProps = {
		months: calendar.months,
		occurrences: calendar.occurrences,
		planned: calendar.planned,
		settings: { today, reminderDaysBefore },
		monthTitle,
		pendingId,
		onMark: handlers.onMark,
	};

	if (phone) {
		return (
			<>
				<PhoneSummary currencies={summary.data?.currencies} phrase={phrase} />
				<PhoneStatusFilter
					status={search.status}
					onStatus={(status) => update({ status })}
				/>
				{state ? (
					<Island className={classes.list}>{state}</Island>
				) : (
					<PhoneCalendar {...calendarProps} onOpenActions={onOpenActions} />
				)}
			</>
		);
	}

	const months = calendar.months;
	const gridPhrase = periodPhrase({
		kind: 'months',
		from: months[0] ?? period.to ?? today,
		to: endOfMonth(months.at(-1) ?? today),
	});

	return (
		<>
			<SummaryCards
				currencies={summary.data?.currencies}
				loading={summary.isPending}
				selected={search.currency}
				phrase={phrase}
			/>
			<Island
				className={classes.list}
				aria-label='Календарь'
				aria-busy={calendar.isFetching}
			>
				<ListFilters
					status={search.status}
					currency={search.currency}
					canReset={filtered}
					onStatus={(status) => update({ status })}
					onCurrency={(currency) => update({ currency })}
					onReset={resetFilters}
				/>
				{state ?? (
					<>
						<CalendarView {...calendarProps} />
						<CalendarLegend
							reminderDaysBefore={reminderDaysBefore}
							total={calendar.occurrences.length + calendar.planned.length}
							planned={calendar.planned.length}
							phrase={gridPhrase}
						/>
					</>
				)}
			</Island>
		</>
	);
}
