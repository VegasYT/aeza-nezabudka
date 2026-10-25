import { Button, Pagination } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';

import { listPaymentOccurrencesOptions } from '@shared/api';
import { startOfMonth } from '@shared/lib/dates';
import { capitalize } from '@shared/lib/text';
import { IconInfoCircle } from '@shared/ui/icons';
import { Island } from '@shared/ui/island';
import { ListState, LoadError } from '@shared/ui/list-state';

import {
	type PlannedEntry,
	plannedForLoaded,
	plannedForPage,
	toPlannedEntries,
} from '../lib/planned';
import {
	PAGE_SIZE,
	useOlderOverdue,
	usePhoneOccurrences,
	usePreviousPageLast,
	useSummary,
	useTablePage,
} from '../model/payments-queries';
import { beforePeriodLabel, periodSearch } from '../model/payments-search';
import { usePlannedPeriods } from '../model/views-queries';
import { formatPeriods } from '../model/wording';
import { ListFilters, PhoneStatusFilter } from './list-filters';
import { ListSkeleton, NoPayments } from './list-states';
import { OccurrencesTable } from './occurrences-table';
import { OlderOverdue } from './older-overdue';
import classes from './payments-page.module.css';
import { OccurrenceCards, PhoneSummary } from './phone-payments';
import type { ScreenProps } from './screen-props';
import { SummaryCards } from './summary-cards';

/** Подпись плановых периодов под списком: «, ещё 2 по расписанию» или «2 периода по расписанию». */
function plannedNote(planned: number, total: number) {
	if (planned === 0) {
		return '';
	}

	return total > 0
		? `, ещё ${planned}\u00a0по\u00a0расписанию`
		: `${formatPeriods(planned)} по\u00a0расписанию`;
}

/** Таблица периодов (на телефоне - карточки с «Показать ещё») с итогами и строкой о прошлой просрочке. */
export function TableScreen({
	search,
	period,
	phrase,
	today,
	reminderDaysBefore,
	phone,
	departments,
	filtered,
	pendingId,
	handlers,
	onOpenActions,
	onAdd,
	update,
	resetFilters,
}: ScreenProps) {
	const summary = useSummary(search, period);
	const tablePage = useTablePage(search, period, !phone);
	const phoneList = usePhoneOccurrences(search, period, phone);
	const older = useOlderOverdue(search, period);
	const page = search.page ?? 1;
	const order = search.order ?? 'asc';
	// Телефон показывает всё загруженное по «Показать ещё», компьютер - одну страницу.
	const list = phone ? phoneList : tablePage;
	const items = phone
		? (phoneList.data?.pages.flatMap((loaded) => loaded.items) ?? [])
		: (tablePage.data?.items ?? []);
	const total =
		(phone ? phoneList.data?.pages[0]?.total : tablePage.data?.total) ?? 0;
	const failed = list.isError && !list.data;

	// Плановые периоды встают по сроку на свою страницу: нужна граница предыдущей.
	const plannedItems = usePlannedPeriods(search, period, today);
	const previousLast = usePreviousPageLast(
		search,
		period,
		!phone && plannedItems.length > 0
	);
	const plannedEntries = toPlannedEntries(plannedItems, items);
	const lastDue = items.at(-1)?.dueDate ?? null;
	const pagePlanned = (): PlannedEntry[] => {
		if (phone) {
			return plannedForLoaded(plannedEntries, {
				order,
				lastLoaded: lastDue,
				complete: !phoneList.hasNextPage,
			});
		}

		if (page > 1 && previousLast === null) {
			return [];
		}

		return plannedForPage(plannedEntries, {
			order,
			previousLast,
			last: lastDue,
			lastPage: page >= Math.ceil(total / PAGE_SIZE),
		});
	};
	const planned = pagePlanned();
	const note = plannedNote(planned.length, total);
	const listEmpty = list.isSuccess && total === 0 && planned.length === 0;
	// Совсем пустая система и пустой фильтр выглядят по-разному: смотрим, есть ли периоды вообще.
	const anyOccurrence = useQuery({
		...listPaymentOccurrencesOptions({ query: { limit: 1 } }),
		enabled: listEmpty,
	});

	const empty = () => {
		if (anyOccurrence.data?.total === 0) {
			return <NoPayments onAdd={onAdd} />;
		}

		const showAll = (
			<Button variant='light' onClick={() => update({ status: undefined })}>
				Показать все периоды
			</Button>
		);

		if (search.status === 'overdue' && !search.currency) {
			return (
				<ListState
					tone='done'
					icon={<IconInfoCircle size={28} />}
					title={`${capitalize(phrase)} просроченных нет`}
					text={'Остальные периоды видны в\u00a0списке «Все».'}
					action={showAll}
				/>
			);
		}

		if (search.status === 'unpaid' && !search.currency) {
			return (
				<ListState
					tone='done'
					icon={<IconInfoCircle size={28} />}
					title={`${capitalize(phrase)} всё оплачено`}
					text={'Оплаченные периоды видны в\u00a0списке «Все».'}
					action={showAll}
				/>
			);
		}

		const department =
			search.dept === 'none'
				? 'без отдела'
				: search.dept
					? `у\u00a0отдела «${departments.find(({ id }) => id === search.dept)?.name ?? ''}»`
					: null;
		const parts = [
			search.currency ? `в\u00a0${search.currency}` : null,
			department,
			phrase,
		].filter(Boolean);

		return (
			<ListState
				icon={<IconInfoCircle size={28} />}
				title='Ничего не нашлось'
				text={`Нет периодов ${parts.join(' ')}.${filtered ? ' Измените фильтры или сбросьте их.' : ''}`}
				action={
					filtered && (
						<Button variant='light' onClick={resetFilters}>
							Сбросить фильтры
						</Button>
					)
				}
			/>
		);
	};

	/** Ошибка, загрузка или пустой список; `null`, когда показывать периоды. */
	const listState = () => {
		if (failed) {
			return (
				<LoadError
					title='Не удалось загрузить платежи'
					onRetry={() => void list.refetch()}
				/>
			);
		}

		if (list.isPending) {
			return <ListSkeleton />;
		}

		if (listEmpty) {
			return anyOccurrence.isPending ? false : empty();
		}

		return null;
	};
	const state = listState();

	const before = beforePeriodLabel(period);
	const olderLine = older && before && (
		<OlderOverdue
			total={older.total}
			currencies={older.currencies}
			before={before}
			onShow={() => {
				if (older.firstDueDate && period.kind !== 'date') {
					update(
						periodSearch(
							{
								kind: 'months',
								from: startOfMonth(older.firstDueDate),
								to: period.to ?? period.from,
							},
							today
						)
					);
				}
			}}
		/>
	);

	if (phone) {
		return (
			<>
				<PhoneSummary currencies={summary.data?.currencies} phrase={phrase} />
				<PhoneStatusFilter
					status={search.status}
					onStatus={(status) => update({ status })}
				/>
				{olderLine}
				<section aria-label='Периоды' aria-busy={list.isFetching}>
					{state ? (
						<Island className={classes.list}>{state}</Island>
					) : (
						<OccurrenceCards
							occurrences={items}
							planned={planned}
							order={order}
							today={today}
							reminderDaysBefore={reminderDaysBefore}
							pendingId={pendingId}
							onMark={handlers.onMark}
							onOpenActions={onOpenActions}
						/>
					)}
				</section>
				{phoneList.hasNextPage && (
					<Button
						variant='default'
						loading={phoneList.isFetchingNextPage}
						onClick={() => void phoneList.fetchNextPage()}
					>
						Показать ещё
					</Button>
				)}
				{(total > 0 || planned.length > 0) && (
					<span className={classes.muted} style={{ textAlign: 'center' }}>
						{total > 0 && `Показано ${items.length} из\u00a0${total}`}
						{note}
					</span>
				)}
			</>
		);
	}

	const from = (page - 1) * PAGE_SIZE + 1;
	const to = Math.min(page * PAGE_SIZE, total);

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
				aria-label='Периоды'
				aria-busy={list.isFetching}
			>
				<ListFilters
					status={search.status}
					currency={search.currency}
					canReset={filtered}
					onStatus={(status) => update({ status })}
					onCurrency={(currency) => update({ currency })}
					onReset={resetFilters}
				/>
				{olderLine}
				{state ?? (
					<>
						<OccurrencesTable
							occurrences={items}
							planned={planned}
							today={today}
							reminderDaysBefore={reminderDaysBefore}
							order={order}
							pendingId={pendingId}
							onToggleOrder={() =>
								update({ order: search.order ? undefined : 'desc' })
							}
							{...handlers}
						/>
						<div className={classes.footer}>
							<span className={classes.muted}>
								{total > 0 && `Показаны ${from}–${to} из\u00a0${total}`}
								{note}
							</span>
							{total > PAGE_SIZE && (
								<Pagination
									total={Math.ceil(total / PAGE_SIZE)}
									value={page}
									onChange={(next) =>
										update({ page: next > 1 ? next : undefined })
									}
								/>
							)}
						</div>
					</>
				)}
			</Island>
		</>
	);
}
