import {
	ActionIcon,
	Button,
	Drawer,
	Indicator,
	SegmentedControl,
	Select,
	Stack,
} from '@mantine/core';
import type { ReactNode } from 'react';

import type {
	Currency,
	CurrencyTotals,
	Department,
	PaymentOccurrence,
} from '@shared/api';
import {
	occurrenceStatus,
	StatusMark,
	TONE_CLASS,
} from '@entities/payment-occurrence';
import { type CalendarDate, formatDate } from '@shared/lib/dates';
import { CURRENCIES, formatMoney } from '@shared/lib/money';
import {
	IconCalendarCheck,
	IconChevronLeft,
	IconChevronRight,
	IconClose,
	IconDots,
	IconPaperclip,
	IconPencil,
	IconReceipt,
	IconUndo,
} from '@shared/ui/icons';
import { Island } from '@shared/ui/island';
import { StoppedBadge } from '@entities/recurring-payment';

import {
	defaultPeriod,
	type Period,
	shiftPeriod,
} from '../model/payments-search';
import { mergeByDue, type PlannedEntry, plannedHint } from '../lib/planned';
import { occurrenceTitle, receiptActionLabel } from '../model/wording';
import { PlannedMark } from './calendar-entry';
import {
	MarkButton,
	type OccurrenceHandlers,
	ReceiptButton,
} from './occurrence-actions';
import classes from './payments-page.module.css';

/** «Фильтры» со счётчиком выбранных отдела и валюты. */
export function FiltersButton({
	count,
	onClick,
}: {
	count: number;
	onClick: () => void;
}) {
	return (
		<Indicator label={count} size={18} disabled={count === 0} offset={4}>
			<Button variant='default' onClick={onClick}>
				Фильтры
			</Button>
		</Indicator>
	);
}

/** Период со стрелками; окно периода - то же, что на компьютере. */
export function PhonePeriodBar({
	today,
	period,
	picker,
	onPeriod,
}: {
	today: CalendarDate;
	period: Period;
	picker: ReactNode;
	onPeriod: (period: Period) => void;
}) {
	return (
		<div className={classes.phonePeriod}>
			{period.kind === 'months' ? (
				<ActionIcon
					variant='subtle'
					color='gray'
					size='lg'
					aria-label='На месяц раньше'
					onClick={() => onPeriod(shiftPeriod(period, -1))}
				>
					<IconChevronLeft />
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
			{picker}
			{period.kind === 'months' && (
				<ActionIcon
					variant='subtle'
					color='gray'
					size='lg'
					aria-label='На месяц позже'
					onClick={() => onPeriod(shiftPeriod(period, 1))}
				>
					<IconChevronRight />
				</ActionIcon>
			)}
		</div>
	);
}

/** Итоги на телефоне: строка на валюту, просрочка красным. */
export function PhoneSummary({
	currencies,
	phrase,
}: {
	currencies: CurrencyTotals[] | undefined;
	phrase: string;
}) {
	return (
		<Island className={classes.phoneSummary} aria-label='Итоги по валютам'>
			<div className={classes.cardHead}>
				<span className={classes.muted}>К оплате</span>
				<span className={classes.muted}>{phrase}</span>
			</div>
			{CURRENCIES.map((code) => {
				const totals = currencies?.find((item) => item.currency === code);
				// Плановые суммы приходят, если у периода есть конец; иначе они нулевые.
				const planned = totals?.plannedMinor ?? 0;

				return (
					<div key={code} className={classes.phoneTotal}>
						<span className={classes.code}>{code}</span>
						{totals && totals.count + (totals.plannedCount ?? 0) > 0 ? (
							<span className={classes.statusText}>
								<span className={classes.phoneLeft}>
									{formatMoney(totals.unpaidMinor + planned, code)}
								</span>
								<span className={classes.muted}>
									{totals.overdueMinor > 0 && (
										<span className={classes.overdueText}>
											просрочено {formatMoney(totals.overdueMinor, code)} ·{' '}
										</span>
									)}
									из {formatMoney(totals.totalMinor + planned, code)}
								</span>
							</span>
						) : (
							<span className={classes.muted}>нет периодов</span>
						)}
					</div>
				);
			})}
		</Island>
	);
}

/** Карточки периодов с «Оплачено» и меню действий в листе снизу. */
export function OccurrenceCards({
	occurrences,
	planned = [],
	order = 'asc',
	today,
	reminderDaysBefore,
	pendingId,
	onMark,
	onOpenActions,
	onReceipt,
	showPayment = true,
}: {
	occurrences: PaymentOccurrence[];
	/** Плановые периоды: встают по сроку среди созданных. */
	planned?: PlannedEntry[];
	order?: 'asc' | 'desc';
	today: CalendarDate;
	reminderDaysBefore: number;
	pendingId: string | null;
	onMark: (occurrence: PaymentOccurrence) => void;
	onOpenActions: (occurrence: PaymentOccurrence) => void;
	/** Окно чека; нет, если чеки на сервере выключены. */
	onReceipt?: (occurrence: PaymentOccurrence) => void;
	/** Название и отдел платежа; в окне одного платежа карточку открывает срок. */
	showPayment?: boolean;
}) {
	return (
		<div className={classes.phoneCards}>
			{mergeByDue(occurrences, planned, order).map((entry) => {
				if (entry.kind === 'planned') {
					const { planned: item } = entry;

					return (
						<Island
							key={entry.key}
							className={`${classes.phoneCard} ${classes.plannedCard}`}
							aria-label={`${item.recurringPayment.name}, срок ${formatDate(item.dueDate)}, по\u00a0расписанию`}
						>
							<div className={classes.phoneCardHead}>
								<span className={classes.name}>
									{item.recurringPayment.name}
								</span>
								<span className={classes.phoneAmount}>
									{formatMoney(item.amountMinor, item.currency)}
								</span>
							</div>
							<span className={classes.muted}>
								{item.department?.name ?? 'Без отдела'} · срок{' '}
								{formatDate(item.dueDate)}
							</span>
							<span className={classes.status}>
								<PlannedMark />
								<span className={classes.statusText}>
									<span>По&nbsp;расписанию</span>
									<span className={classes.muted}>
										{plannedHint(entry, today)}
									</span>
								</span>
							</span>
						</Island>
					);
				}

				const { occurrence } = entry;
				const status = occurrenceStatus(occurrence, today, reminderDaysBefore);
				const menu = (
					<ActionIcon
						variant={occurrence.paid ? 'subtle' : 'light'}
						color='gray'
						size='lg'
						aria-label={`Действия: ${occurrenceTitle(occurrence)}`}
						aria-haspopup='dialog'
						onClick={() => onOpenActions(occurrence)}
					>
						<IconDots size={20} />
					</ActionIcon>
				);

				return (
					<Island
						key={occurrence.id}
						className={classes.phoneCard}
						aria-label={occurrenceTitle(occurrence)}
					>
						<div className={classes.phoneCardHead}>
							<span className={classes.name}>
								{showPayment ? (
									<>
										{occurrence.recurringPayment.name}
										<StoppedBadge
											stopped={occurrence.recurringPayment.stopped}
										/>
									</>
								) : (
									`Срок ${formatDate(occurrence.dueDate)}`
								)}
							</span>
							<span className={classes.phoneAmount}>
								{formatMoney(occurrence.amountMinor, occurrence.currency)}
							</span>
						</div>
						{showPayment && (
							<span className={classes.muted}>
								{occurrence.department?.name ?? 'Без отдела'} · срок{' '}
								{formatDate(occurrence.dueDate)}
							</span>
						)}
						<div className={classes.phoneStatusRow}>
							<span className={classes.status}>
								<StatusMark tone={status.tone} />
								<span className={classes.statusText}>
									<span className={TONE_CLASS[status.tone]}>
										{status.label}
										{status.lateDays !== null &&
											status.tone === 'overdue' &&
											` ${status.lateDays}\u00a0дн.`}
									</span>
									{occurrence.paidOn ? (
										<span className={classes.muted}>
											{formatDate(occurrence.paidOn)}
											{status.tone === 'late' &&
												`, на\u00a0${status.lateDays}\u00a0дн. позже срока`}
										</span>
									) : (
										status.hint && (
											<span className={classes.muted}>{status.hint}</span>
										)
									)}
								</span>
							</span>
							{occurrence.paid && (
								<span className={classes.phoneCardTools}>
									{occurrence.receipt && onReceipt && (
										<ReceiptButton
											occurrence={occurrence}
											onReceipt={onReceipt}
										/>
									)}
									{menu}
								</span>
							)}
						</div>
						{!occurrence.paid && (
							<div className={classes.phoneActions}>
								<MarkButton
									occurrence={occurrence}
									saving={pendingId === occurrence.id}
									onMark={onMark}
									fullWidth
								/>
								{menu}
							</div>
						)}
					</Island>
				);
			})}
		</div>
	);
}

/** Лист снизу с действиями над периодом. */
export function ActionSheet({
	occurrence,
	onClose,
	onPickDate,
	onUnmark,
	onReceipt,
}: Omit<OccurrenceHandlers, 'onMark'> & {
	occurrence: PaymentOccurrence | null;
	onClose: () => void;
}) {
	const run = (action: () => void) => {
		onClose();
		action();
	};

	return (
		<Drawer
			opened={occurrence !== null}
			onClose={onClose}
			position='bottom'
			classNames={{ content: classes.sheet }}
			title={occurrence?.recurringPayment.name}
		>
			{occurrence && (
				<Stack gap={4}>
					{occurrence.paid ? (
						<>
							<Button
								variant='subtle'
								color='dark'
								className={classes.sheetAction}
								justify='flex-start'
								leftSection={<IconPencil size={20} />}
								onClick={() => run(() => onPickDate(occurrence, 'fix'))}
							>
								Исправить дату
							</Button>
							{onReceipt && (
								<Button
									variant='subtle'
									color='dark'
									className={classes.sheetAction}
									justify='flex-start'
									leftSection={
										occurrence.receipt ? (
											<IconReceipt size={20} />
										) : (
											<IconPaperclip size={20} />
										)
									}
									onClick={() => run(() => onReceipt(occurrence))}
								>
									{receiptActionLabel(occurrence)}
								</Button>
							)}
							<Button
								variant='subtle'
								color='var(--mantine-color-error)'
								className={classes.sheetAction}
								justify='flex-start'
								leftSection={<IconUndo size={20} />}
								onClick={() => run(() => onUnmark(occurrence))}
							>
								Отменить оплату
							</Button>
						</>
					) : (
						<Button
							variant='subtle'
							color='dark'
							className={classes.sheetAction}
							justify='flex-start'
							leftSection={<IconCalendarCheck size={20} />}
							onClick={() => run(() => onPickDate(occurrence, 'other'))}
						>
							Оплачено в другой день
						</Button>
					)}
				</Stack>
			)}
		</Drawer>
	);
}

/** Лист фильтров телефона: отдел и валюта. */
export function FiltersSheet({
	opened,
	dept,
	currency,
	departments,
	onClose,
	onDept,
	onCurrency,
}: {
	opened: boolean;
	dept: string | undefined;
	currency: Currency | undefined;
	departments: Department[];
	onClose: () => void;
	onDept: (dept: string | undefined) => void;
	onCurrency: (currency: Currency | undefined) => void;
}) {
	return (
		<Drawer
			opened={opened}
			onClose={onClose}
			position='bottom'
			classNames={{ content: classes.sheet }}
			title='Фильтры'
		>
			<Stack gap='md'>
				<Select
					label='Отдел'
					size='md'
					allowDeselect={false}
					value={dept ?? 'all'}
					onChange={(value) =>
						onDept(value === 'all' || value === null ? undefined : value)
					}
					data={[
						{ value: 'all', label: 'Все отделы' },
						...departments.map(({ id, name }) => ({ value: id, label: name })),
						{ value: 'none', label: 'Без отдела' },
					]}
				/>
				<SegmentedControl
					fullWidth
					size='md'
					aria-label='Валюта'
					value={currency ?? 'all'}
					onChange={(value) =>
						onCurrency(value === 'all' ? undefined : (value as Currency))
					}
					data={[
						{ value: 'all', label: 'Все' },
						...CURRENCIES.map((code) => ({ value: code, label: code })),
					]}
				/>
				<Button onClick={onClose}>Готово</Button>
			</Stack>
		</Drawer>
	);
}
