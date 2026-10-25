import {
	Button,
	Pagination,
	SegmentedControl,
	Select,
	Skeleton,
} from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, Outlet } from '@tanstack/react-router';

import { settingsOptions } from '@shared/api';
import { formatDays, plural } from '@shared/lib/plural';
import { usePhone } from '@shared/lib/media';
import { AddButton } from '@shared/ui/add-button';
import { IconDocument, IconInfoCircle, IconPlus } from '@shared/ui/icons';
import { Island } from '@shared/ui/island';
import { ListState, LoadError } from '@shared/ui/list-state';
import { PageTitle } from '@shared/ui/page-title';

import {
	PAGE_SIZE,
	useDepartments,
	usePaymentCounts,
	useRecurringPayments,
} from '../model/recurring-queries';
import type {
	PaymentsFilter,
	RecurringSearch,
} from '../model/recurring-search';
import { usePaymentDialogs } from './payment-dialogs';
import { PaymentCards, PaymentsTable } from './payments-list';
import classes from './recurring-payments.module.css';

const route = getRouteApi('/_authenticated/_admin/recurring-payments');

const FILTERS: { value: PaymentsFilter; label: string }[] = [
	{ value: 'active', label: 'Действующие' },
	{ value: 'stopped', label: 'Прекращённые' },
	{ value: 'all', label: 'Все' },
];

function ListSkeleton() {
	return (
		<div aria-hidden='true'>
			{[42, 56, 38, 50].map((width) => (
				<div key={width} className={classes.skeletonRow}>
					<Skeleton height={14} width={`${width}%`} />
					<Skeleton height={14} width={96} />
				</div>
			))}
		</div>
	);
}

/** Раздел «Регулярные платежи»: список с фильтрами, создание, изменение и прекращение платежей. */
export function RecurringPaymentsPage() {
	const search = route.useSearch();
	const navigate = route.useNavigate();
	const { data: settings } = useSuspenseQuery(settingsOptions());
	const { today, reminderDaysBefore } = settings;
	const phone = usePhone();
	const list = useRecurringPayments(search);
	const counts = usePaymentCounts(search.dept);
	const departments = useDepartments();
	const dialogs = usePaymentDialogs();

	const status = search.status ?? 'active';
	const page = search.page ?? 1;
	const items = list.data?.items ?? [];
	const total = list.data?.total ?? 0;
	// Совсем пустой раздел видно по числам фильтров без отдела.
	const noPayments = search.dept === undefined && counts?.all === 0;
	const filtered = search.dept !== undefined || search.status !== undefined;

	/** Меняет адрес; смена фильтров возвращает на первую страницу. */
	const update = (changes: Partial<RecurringSearch>) =>
		void navigate({
			search: (previous) => ({ ...previous, page: undefined, ...changes }),
		});

	const filterControl = (
		<SegmentedControl
			fullWidth={phone}
			aria-label='Состояние платежа'
			value={status}
			onChange={(value) =>
				update({
					status: value === 'active' ? undefined : (value as 'stopped' | 'all'),
				})
			}
			data={FILTERS.map(({ value, label }) => ({
				value,
				label: (
					<>
						{label}{' '}
						<span className={classes.count}>{counts?.[value] ?? ''}</span>
					</>
				),
			}))}
		/>
	);
	const deptControl = (
		<Select
			aria-label='Отдел'
			size={phone ? 'md' : 'sm'}
			w={phone ? undefined : 220}
			allowDeselect={false}
			data={[
				{ value: 'all', label: 'Все отделы' },
				...departments.map(({ id, name }) => ({ value: id, label: name })),
				{ value: 'none', label: 'Без отдела' },
			]}
			value={search.dept ?? 'all'}
			onChange={(value) =>
				update({ dept: value === 'all' || !value ? undefined : value })
			}
		/>
	);

	const body = () => {
		if (list.isError && !list.data) {
			return (
				<LoadError
					title='Не удалось загрузить регулярные платежи'
					onRetry={() => void list.refetch()}
				/>
			);
		}

		if (list.isPending) {
			return <ListSkeleton />;
		}

		if (total === 0) {
			return (
				<ListState
					icon={<IconInfoCircle size={28} />}
					title='Таких платежей нет'
					text={
						filtered
							? 'Измените фильтры или сбросьте их.'
							: 'Действующих платежей нет, есть только прекращённые.'
					}
					action={
						filtered ? (
							<Button
								variant='light'
								onClick={() => update({ dept: undefined, status: undefined })}
							>
								Сбросить фильтры
							</Button>
						) : (
							<Button variant='light' onClick={() => update({ status: 'all' })}>
								Показать все
							</Button>
						)
					}
				/>
			);
		}

		const view = { payments: items, today, reminderDaysBefore };

		return phone ? (
			<PaymentCards {...view} />
		) : (
			<PaymentsTable
				{...view}
				onEdit={dialogs.edit}
				onStop={dialogs.stop}
				onResume={dialogs.resume}
			/>
		);
	};

	return (
		<>
			<div className={classes.head}>
				<PageTitle>Регулярные платежи</PageTitle>
				{!noPayments && (
					<AddButton label='Добавить платёж' onClick={dialogs.create} />
				)}
			</div>

			{noPayments ? (
				<Island className={classes.list}>
					<ListState
						icon={<IconDocument size={28} />}
						title='Регулярных платежей пока нет'
						text={`Добавьте регулярные счета: аренду, подписки, серверы. За\u00a0${formatDays(reminderDaysBefore)} до\u00a0срока придёт напоминание в\u00a0Telegram.`}
						action={
							<Button
								leftSection={<IconPlus size={18} />}
								onClick={dialogs.create}
							>
								Добавить платёж
							</Button>
						}
					/>
				</Island>
			) : (
				<Island
					className={classes.list}
					aria-label='Список регулярных платежей'
					aria-busy={list.isFetching}
				>
					{phone ? (
						<div className={classes.phoneFilters}>
							{filterControl}
							{deptControl}
						</div>
					) : (
						<div className={classes.filters}>
							{filterControl}
							{deptControl}
						</div>
					)}
					{body()}
					{total > 0 && (
						<div className={classes.footer}>
							<span className={classes.muted}>
								{plural(total, 'платёж', 'платежа', 'платежей')},
								по&nbsp;алфавиту
							</span>
							{total > PAGE_SIZE && (
								<Pagination
									total={Math.ceil(total / PAGE_SIZE)}
									value={page}
									onChange={(next) =>
										void navigate({
											search: (previous) => ({
												...previous,
												page: next > 1 ? next : undefined,
											}),
										})
									}
								/>
							)}
						</div>
					)}
				</Island>
			)}

			{dialogs.element}
			<Outlet />
		</>
	);
}
