import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';

import {
	departmentsOptions,
	type PaymentOccurrence,
	settingsOptions,
} from '@shared/api';
import { useCurrentUser } from '@shared/auth';
import { usePhone } from '@shared/lib/media';

import {
	type PaymentsSearch,
	type Period,
	periodPhrase,
	periodSearch,
	resolvePeriod,
} from '../model/payments-search';
import { useReceiptActions } from '../model/receipts';
import { useOccurrenceActions } from '../model/use-occurrence-actions';
import { BudgetScreen } from './budget-view';
import { CalendarScreen } from './calendar-screen';
import { PaidDateDialog, type PaidDateMode } from './paid-date-dialog';
import { PaymentDialog } from './payment-dialog';
import { PaymentsToolbar, type ScreenView } from './payments-toolbar';
import { ActionSheet, FiltersSheet } from './phone-payments';
import { ReceiptDialog } from './receipt-dialog';
import type { ScreenProps } from './screen-props';
import { TableScreen } from './table-screen';
import { UnmarkDialog } from './unmark-dialog';

// Форма платежа тянет zod и TanStack Form, а нужна только администратору и по кнопке.
const PaymentFormDialog = lazy(() =>
	import('@features/recurring-payment-form').then(
		({ PaymentFormDialog: Dialog }) => ({ default: Dialog })
	)
);

const route = getRouteApi('/_authenticated/payments');

/** Раздел «Платежи»: шапка с периодом и отделом, вид (таблица, календарь, бюджет) и общие окна действий. */
export function PaymentsPage() {
	const search = route.useSearch();
	const navigate = route.useNavigate();
	const { data: settings } = useSuspenseQuery(settingsOptions());
	const user = useCurrentUser();
	const { today, reminderDaysBefore } = settings;
	const period = resolvePeriod(search, today);
	const phone = usePhone();
	const departments = useQuery(departmentsOptions()).data?.items ?? [];
	const view: ScreenView = search.view ?? 'table';
	const currentYear = Number(today.slice(0, 4));
	const budgetYear = search.year ?? currentYear;

	const actions = useOccurrenceActions();
	const receipts = useReceiptActions();
	const [dateTarget, setDateTarget] = useState<{
		occurrence: PaymentOccurrence;
		mode: PaidDateMode;
	} | null>(null);
	const [sheetTarget, setSheetTarget] = useState<PaymentOccurrence | null>(
		null
	);
	const [receiptTarget, setReceiptTarget] = useState<PaymentOccurrence | null>(
		null
	);
	const [unmarkTarget, setUnmarkTarget] = useState<PaymentOccurrence | null>(
		null
	);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [adding, setAdding] = useState(false);
	// Форма грузится при первом открытии и остаётся смонтированной: окно закрывается с анимацией.
	const [formLoaded, setFormLoaded] = useState(false);
	const onAdd =
		user?.role === 'admin'
			? () => {
					setFormLoaded(true);
					setAdding(true);
				}
			: undefined;

	const update = (changes: Partial<PaymentsSearch>) =>
		void navigate({
			search: (previous) => ({ ...previous, page: undefined, ...changes }),
		});
	const setView = (next: ScreenView) =>
		void navigate({
			search: (previous) => ({
				...previous,
				page: undefined,
				view: next === 'table' ? undefined : next,
				year: next === 'budget' ? previous.year : undefined,
			}),
		});
	const handlers = {
		onMark: (occurrence: PaymentOccurrence) =>
			void actions.markToday(occurrence),
		onPickDate: (occurrence: PaymentOccurrence, mode: PaidDateMode) =>
			setDateTarget({ occurrence, mode }),
		// Отмена оплаты удаляет и чек, поэтому с чеком сначала подтверждение.
		onUnmark: (occurrence: PaymentOccurrence) =>
			occurrence.receipt
				? setUnmarkTarget(occurrence)
				: void actions.unmark(occurrence),
		onReceipt: settings.receiptsEnabled ? setReceiptTarget : undefined,
	};
	const screen: ScreenProps = {
		search,
		period,
		phrase: periodPhrase(period),
		today,
		reminderDaysBefore,
		phone,
		departments,
		filtered:
			search.dept !== undefined ||
			search.status !== undefined ||
			search.currency !== undefined,
		pendingId: actions.pendingId,
		handlers,
		onOpenActions: setSheetTarget,
		onAdd,
		update,
		resetFilters: () =>
			update({ dept: undefined, status: undefined, currency: undefined }),
	};

	return (
		<>
			<PaymentsToolbar
				today={today}
				period={period}
				dept={search.dept}
				departments={departments}
				onPeriod={(next: Period) => update(periodSearch(next, today))}
				onDept={(dept) => update({ dept })}
				phone={phone}
				filterCount={
					(search.dept === undefined ? 0 : 1) +
					(search.currency === undefined ? 0 : 1)
				}
				onFilters={() => setFiltersOpen(true)}
				onAdd={onAdd}
				view={view}
				year={budgetYear}
				onView={setView}
				onYear={(next) =>
					update({ year: next === currentYear ? undefined : next })
				}
			/>
			{view === 'table' && <TableScreen {...screen} />}
			{view === 'calendar' && <CalendarScreen {...screen} />}
			{view === 'budget' && (
				<BudgetScreen
					search={search}
					today={today}
					year={budgetYear}
					phone={phone}
				/>
			)}
			{search.payment && (
				<PaymentDialog
					paymentId={search.payment}
					phone={phone}
					today={today}
					reminderDaysBefore={reminderDaysBefore}
					pendingId={actions.pendingId}
					handlers={handlers}
					onOpenActions={setSheetTarget}
					onClose={() =>
						void navigate({
							search: (previous) => ({ ...previous, payment: undefined }),
						})
					}
				/>
			)}
			{phone && (
				<>
					<ActionSheet
						occurrence={sheetTarget}
						onClose={() => setSheetTarget(null)}
						onPickDate={handlers.onPickDate}
						onUnmark={handlers.onUnmark}
						onReceipt={handlers.onReceipt}
					/>
					<FiltersSheet
						opened={filtersOpen}
						dept={search.dept}
						currency={search.currency}
						departments={departments}
						onClose={() => setFiltersOpen(false)}
						onDept={(dept) => update({ dept })}
						onCurrency={(currency) => update({ currency })}
					/>
				</>
			)}
			<PaidDateDialog
				target={dateTarget}
				today={today}
				onClose={() => setDateTarget(null)}
				onSubmit={(occurrence, mode, paidOn) =>
					mode === 'fix'
						? actions.correctDate(occurrence, paidOn)
						: actions.markOn(occurrence, paidOn)
				}
				onAttach={settings.receiptsEnabled ? receipts.attach : undefined}
			/>
			<ReceiptDialog
				occurrence={receiptTarget}
				onChange={setReceiptTarget}
				onClose={() => setReceiptTarget(null)}
			/>
			<UnmarkDialog
				occurrence={unmarkTarget}
				onClose={() => setUnmarkTarget(null)}
				onConfirm={(occurrence) => void actions.unmark(occurrence)}
			/>
			{onAdd && formLoaded && (
				<Suspense fallback={null}>
					<PaymentFormDialog
						payment={null}
						opened={adding}
						onClose={() => setAdding(false)}
					/>
				</Suspense>
			)}
		</>
	);
}
