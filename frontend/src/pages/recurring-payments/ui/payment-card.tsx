import { ActionIcon, Button, Drawer, Skeleton, Text } from '@mantine/core';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import {
	occurrenceStatus,
	StatusMark,
	TONE_CLASS,
} from '@entities/payment-occurrence';
import {
	CURRENCY_NAMES,
	isPaymentMissing,
	nextDueAfter,
	nextDueView,
	PaymentBadges,
	paymentProgress,
	scheduleLabel,
} from '@entities/recurring-payment';
import {
	type PaymentOccurrence,
	type RecurringPayment,
	settingsOptions,
} from '@shared/api';
import { type CalendarDate, formatDate, formatMoment } from '@shared/lib/dates';
import { formatMoney } from '@shared/lib/money';
import { plural } from '@shared/lib/plural';
import { usePhone } from '@shared/lib/media';
import { capitalize } from '@shared/lib/text';
import {
	IconArrowLeft,
	IconBan,
	IconPencil,
	IconRefresh,
} from '@shared/ui/icons';
import { LoadError } from '@shared/ui/list-state';

import { paymentOptions, usePaymentHistory } from '../model/recurring-queries';
import { usePaymentDialogs } from './payment-dialogs';
import classes from './recurring-payments.module.css';

const route = getRouteApi(
	'/_authenticated/_admin/recurring-payments/$paymentId'
);

interface CardContext {
	today: CalendarDate;
	reminderDaysBefore: number;
	phone: boolean;
}

/** Статус периода в истории: дни просрочки и опоздания - в самой подписи, отдельной колонки нет. */
function historyStatus(
	occurrence: PaymentOccurrence,
	today: CalendarDate,
	reminderDaysBefore: number
) {
	const status = occurrenceStatus(occurrence, today, reminderDaysBefore);

	if (status.tone === 'overdue') {
		return { ...status, label: `Просрочено ${status.lateDays}\u00a0дн.` };
	}

	if (status.tone === 'late') {
		return {
			...status,
			hint: `на\u00a0${status.lateDays}\u00a0дн. позже срока`,
		};
	}

	return status;
}

interface Fact {
	label: string;
	value: string;
	sub?: string | null;
	soon?: boolean;
	/** Сумма набирается крупно, как на макете. */
	big?: boolean;
}

function Facts({ facts }: { facts: Fact[] }) {
	return (
		<section aria-label='О платеже' className={classes.facts}>
			{facts.map(({ label, value, sub, soon, big }) => (
				<div key={label} className={classes.fact}>
					<span className={classes.factLabel}>{label}</span>
					<span className={big ? classes.factBig : classes.factValue}>
						{value}
					</span>
					{sub && (
						<span className={`${classes.sub} ${soon ? classes.soon : ''}`}>
							{sub}
						</span>
					)}
				</div>
			))}
		</section>
	);
}

function paymentFacts(
	payment: RecurringPayment,
	{ today, reminderDaysBefore }: CardContext
): Fact[] {
	const due = nextDueView(payment, today, reminderDaysBefore);
	const progress = paymentProgress(payment);
	const shifts =
		payment.period !== 'day' &&
		payment.period !== 'week' &&
		payment.anchorDay >= 29 &&
		payment.anchorDay < 31;

	return [
		{
			label: 'Расписание',
			value: capitalize(scheduleLabel(payment)),
			sub: shifts ? 'в\u00a0коротких месяцах в\u00a0последний день' : null,
		},
		...(progress
			? [{ label: 'Число оплат', value: capitalize(progress) }]
			: []),
		payment.stoppedAt
			? {
					label: 'Прекращён',
					value: formatMoment(payment.stoppedAt),
					sub: 'новых периодов и\u00a0напоминаний нет',
				}
			: {
					label: 'Ближайший срок',
					value: due.date ?? '—',
					sub: due.note,
					soon: due.soon,
				},
		{ label: 'Отдел', value: payment.department?.name ?? 'Без отдела' },
		{
			label: 'Добавлен',
			value: formatMoment(payment.createdAt),
			sub: payment.createdByLogin,
		},
	];
}

function History({
	payment,
	context,
}: {
	payment: RecurringPayment;
	context: CardContext;
}) {
	const { today, reminderDaysBefore, phone } = context;
	const history = usePaymentHistory(payment.id);
	const items = history.data?.pages.flatMap((page) => page.items) ?? [];
	const total = history.data?.pages[0]?.total ?? 0;
	const [newest] = items;
	const allCreated =
		payment.occurrenceLimit !== null &&
		history.isSuccess &&
		total >= payment.occurrenceLimit;
	const footer = payment.stoppedAt
		? 'Будущие периоды удалены при прекращении, прошлые остались.'
		: allCreated
			? 'Новых периодов не\u00a0будет: все периоды по\u00a0числу оплат уже появились.'
			: newest && newest.dueDate > today
				? `Период ${formatDate(nextDueAfter(newest.dueDate, payment))} появится ${formatDate(newest.dueDate)}.`
				: null;

	const rows = items.map((occurrence) => {
		const status = historyStatus(occurrence, today, reminderDaysBefore);
		const paid = occurrence.paidOn
			? `${formatDate(occurrence.paidOn)} · ${occurrence.paidByLogin ?? ''}`
			: null;

		return { occurrence, status, paid };
	});

	return (
		<section aria-labelledby='payment-history'>
			<div className={classes.historyHead}>
				<h3 id='payment-history' className={classes.historyTitle}>
					История периодов
				</h3>
				{history.isSuccess && (
					<span className={classes.muted}>
						{plural(total, 'период', 'периода', 'периодов')}
						{total > 1 && ', сначала новые'}
					</span>
				)}
			</div>
			{history.isError && !history.data && (
				<LoadError
					title='Не удалось загрузить историю'
					onRetry={() => void history.refetch()}
				/>
			)}
			{history.isPending && (
				<div className={classes.historyFoot}>
					<Skeleton height={14} width='60%' />
				</div>
			)}
			{phone
				? rows.map(({ occurrence, status, paid }) => (
						<div key={occurrence.id} className={classes.historyRow}>
							<span className={classes.historyRowHead}>
								<span>{formatDate(occurrence.dueDate)}</span>
								<span className={classes.numeric}>
									{formatMoney(occurrence.amountMinor, occurrence.currency)}
								</span>
							</span>
							<span className={classes.status}>
								<StatusMark tone={status.tone} />
								<span className={TONE_CLASS[status.tone]}>{status.label}</span>
							</span>
							{(status.hint || paid) && (
								<span className={classes.sub}>
									{[status.hint, paid].filter(Boolean).join(', ')}
								</span>
							)}
						</div>
					))
				: items.length > 0 && (
						<table className={classes.history}>
							<thead>
								<tr>
									<th scope='col'>Срок</th>
									<th scope='col' className={classes.numeric}>
										Сумма
									</th>
									<th scope='col'>Статус</th>
									<th scope='col'>Дата оплаты</th>
								</tr>
							</thead>
							<tbody>
								{rows.map(({ occurrence, status }) => (
									<tr key={occurrence.id}>
										<td className={classes.date}>
											{formatDate(occurrence.dueDate)}
										</td>
										<td className={classes.numeric}>
											{formatMoney(occurrence.amountMinor, occurrence.currency)}
										</td>
										<td>
											<span className={classes.status}>
												<StatusMark tone={status.tone} />
												<span className={classes.stack}>
													<span className={TONE_CLASS[status.tone]}>
														{status.label}
													</span>
													{status.hint && (
														<span className={classes.sub}>{status.hint}</span>
													)}
												</span>
											</span>
										</td>
										<td>
											{occurrence.paidOn ? (
												<span className={classes.stack}>
													<span className={classes.date}>
														{formatDate(occurrence.paidOn)}
													</span>
													<span className={classes.sub}>
														{occurrence.paidByLogin}
													</span>
												</span>
											) : (
												<span className={classes.none}>—</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
			{history.hasNextPage && (
				<Button
					className={classes.more}
					variant='default'
					loading={history.isFetchingNextPage}
					onClick={() => void history.fetchNextPage()}
				>
					Показать ещё
				</Button>
			)}
			{footer && <div className={classes.historyFoot}>{footer}</div>}
		</section>
	);
}

function CardActions({
	payment,
	onEdit,
	onStop,
	onResume,
}: {
	payment: RecurringPayment;
	onEdit: () => void;
	onStop: () => void;
	onResume: () => void;
}) {
	if (payment.stoppedAt) {
		return (
			<div className={classes.cardActions}>
				<Button
					variant='light'
					leftSection={<IconRefresh size={18} />}
					onClick={onResume}
				>
					Возобновить
				</Button>
			</div>
		);
	}

	return (
		<div className={classes.cardActions}>
			<Button
				variant='light'
				leftSection={<IconPencil size={18} />}
				onClick={onEdit}
			>
				Изменить
			</Button>
			<Button
				variant='subtle'
				color='var(--mantine-color-error)'
				leftSection={<IconBan size={18} />}
				onClick={onStop}
			>
				Прекратить
			</Button>
		</div>
	);
}

function CardHeader({
	title,
	payment,
	phone,
	onClose,
	children,
}: {
	title: string;
	payment?: RecurringPayment;
	phone: boolean;
	onClose: () => void;
	children?: ReactNode;
}) {
	if (phone) {
		return (
			<div className={classes.phoneHead}>
				<ActionIcon
					variant='subtle'
					color='gray'
					size='lg'
					aria-label='Назад к списку'
					onClick={onClose}
				>
					<IconArrowLeft size={22} />
				</ActionIcon>
				<Drawer.Title className={classes.phoneName}>{title}</Drawer.Title>
			</div>
		);
	}

	return (
		<div className={classes.cardHead}>
			<div className={classes.cardTitleRow}>
				<div className={classes.cardTitle}>
					<Drawer.Title className={classes.cardName}>{title}</Drawer.Title>
					{payment && <PaymentBadges payment={payment} />}
				</div>
				<Drawer.CloseButton aria-label='Закрыть' size='lg' />
			</div>
			{children}
		</div>
	);
}

/** Карточка регулярного платежа поверх списка: данные, история периодов, изменение и прекращение. */
export function RecurringPaymentCard() {
	const { paymentId } = route.useParams();
	const navigate = route.useNavigate();
	const { data: settings } = useSuspenseQuery(settingsOptions());
	const phone = usePhone();
	const payment = useQuery(paymentOptions(paymentId));
	const dialogs = usePaymentDialogs();
	const context: CardContext = { ...settings, phone };
	const close = () =>
		void navigate({ to: '/recurring-payments', search: true });
	const missing = payment.isError && isPaymentMissing(payment.error);

	const content = () => {
		if (payment.data) {
			const data = payment.data;
			const actions = (
				<CardActions
					payment={data}
					onEdit={() => dialogs.edit(data)}
					onStop={() => dialogs.stop(data)}
					onResume={() => dialogs.resume(data)}
				/>
			);

			return (
				<>
					<CardHeader
						title={data.name}
						payment={data}
						phone={phone}
						onClose={close}
					>
						{actions}
					</CardHeader>
					<Drawer.Body>
						{phone ? (
							<div className={classes.phoneSummary}>
								<span className={classes.nameLine}>
									<span className={classes.factBig}>
										{formatMoney(data.amountMinor, data.currency)}
									</span>
									<PaymentBadges payment={data} />
								</span>
								{actions}
							</div>
						) : null}
						<Facts
							facts={
								phone
									? paymentFacts(data, context)
									: [
											{
												label: 'Сумма',
												value: formatMoney(data.amountMinor, data.currency),
												sub: CURRENCY_NAMES[data.currency],
												big: true,
											},
											...paymentFacts(data, context),
										]
							}
						/>
						<History payment={data} context={context} />
					</Drawer.Body>
				</>
			);
		}

		if (missing) {
			return (
				<>
					<CardHeader title='Платёж не найден' phone={phone} onClose={close} />
					<div className={classes.notFound}>
						<Text c='dimmed'>Такого платежа нет. Проверьте ссылку.</Text>
						<Button variant='light' onClick={close}>
							К&nbsp;списку платежей
						</Button>
					</div>
				</>
			);
		}

		return (
			<>
				<CardHeader title='Регулярный платёж' phone={phone} onClose={close} />
				{payment.isError ? (
					<LoadError
						title='Не удалось загрузить платёж'
						onRetry={() => void payment.refetch()}
					/>
				) : (
					<div className={classes.notFound}>
						<Skeleton height={20} width='50%' />
						<Skeleton height={14} width='70%' />
					</div>
				)}
			</>
		);
	};

	return (
		<>
			<Drawer.Root
				opened
				onClose={close}
				position='right'
				size={phone ? '100%' : 640}
				offset={phone ? 0 : 6}
				radius={phone ? 0 : 'lg'}
				// Класс у Drawer.Content попал бы и на внешний контейнер панели: стили частей - через classNames.
				classNames={{
					content: classes.drawerContent,
					body: classes.drawerBody,
				}}
			>
				<Drawer.Overlay />
				<Drawer.Content>{content()}</Drawer.Content>
			</Drawer.Root>
			{dialogs.element}
		</>
	);
}
