import { Button, Skeleton, Text } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';

import { plural } from '@shared/lib/plural';
import { usePhone } from '@shared/lib/media';
import { IconJournal } from '@shared/ui/icons';
import { Island } from '@shared/ui/island';
import { ListState, LoadError } from '@shared/ui/list-state';
import { PageTitle } from '@shared/ui/page-title';

import { groupByDay, localDay } from '../lib/days';
import {
	useAuditLog,
	useDepartments,
	useMembers,
} from '../model/audit-queries';
import { type AuditSearch, auditPeriod } from '../model/audit-search';
import { EntriesCards, EntriesTable } from './audit-entries';
import { AuditFilters } from './audit-filters';
import classes from './audit-log-page.module.css';

const route = getRouteApi('/_authenticated/_admin/audit');

function recordsCount(count: number) {
	return plural(count, 'запись', 'записи', 'записей');
}

/** Раздел «Журнал»: кто, когда и что сделал; фильтры по действию, автору и периоду. */
export function AuditLogPage() {
	const search = route.useSearch();
	const navigate = route.useNavigate();
	// Журнал про моменты времени: «сегодня» берётся по часам браузера, как и время записей.
	const [now] = useState(() => new Date());
	const today = localDay(now);
	const phone = usePhone();
	const log = useAuditLog(search, today);
	const members = useMembers();
	const departments = useDepartments();

	const period = auditPeriod(search, today);
	const defaults = auditPeriod({}, today);
	const filtered = Object.values(search).some((value) => value !== undefined);
	const entries = log.data?.pages.flatMap((page) => page.items) ?? [];
	const total = log.data?.pages.at(-1)?.total ?? 0;

	/** Меняет адрес; значения по умолчанию в него не пишутся. */
	const update = (changes: Partial<AuditSearch>) =>
		void navigate({
			search: (previous) => {
				const next = { ...previous, ...changes };

				return {
					...next,
					from: next.from === defaults.from ? undefined : next.from,
					to: next.to === defaults.to ? undefined : next.to,
				};
			},
		});
	const reset = () => void navigate({ search: {} });

	const body = () => {
		if (log.isPending) {
			return (
				<div className={classes.skeleton} aria-hidden='true'>
					{[46, 60, 38, 52].map((width) => (
						<Skeleton key={width} height={14} width={`${width}%`} />
					))}
				</div>
			);
		}

		if (log.isError && entries.length === 0) {
			return (
				<LoadError
					title='Не удалось загрузить журнал'
					onRetry={() => void log.refetch()}
				/>
			);
		}

		if (entries.length === 0) {
			return (
				<ListState
					icon={<IconJournal size={28} />}
					title='Записей нет'
					text={
						'С\u00a0такими фильтрами за\u00a0выбранный период ничего не\u00a0нашлось.'
					}
					action={
						filtered && (
							<Button variant='light' onClick={reset}>
								Сбросить фильтры
							</Button>
						)
					}
				/>
			);
		}

		const days = groupByDay(entries, now);
		const loadedAll = entries.length >= total;

		return (
			<>
				{phone ? (
					<EntriesCards days={days} departments={departments.data?.items} />
				) : (
					<EntriesTable days={days} departments={departments.data?.items} />
				)}
				<div className={classes.footer}>
					<Text size='xs' c='dimmed'>
						{loadedAll
							? 'Показаны все записи за\u00a0период.'
							: `Показаны ${entries.length} из\u00a0${total}.`}{' '}
						Время по&nbsp;часовому поясу браузера.
					</Text>
					{!loadedAll && (
						<Button
							variant='default'
							loading={log.isFetchingNextPage}
							onClick={() => void log.fetchNextPage()}
						>
							Показать ещё
						</Button>
					)}
				</div>
			</>
		);
	};

	return (
		<>
			<PageTitle>Журнал</PageTitle>
			{phone && (
				<AuditFilters
					search={search}
					period={period}
					today={today}
					members={members.data?.items}
					phone
					onChange={update}
				/>
			)}
			<Island aria-label='Записи журнала' className={classes.island}>
				{!phone && (
					<div className={classes.head}>
						<AuditFilters
							search={search}
							period={period}
							today={today}
							members={members.data?.items}
							phone={false}
							onChange={update}
						/>
						{log.isSuccess && (
							<Text size='sm' c='dimmed' className={classes.count}>
								{recordsCount(total)}
							</Text>
						)}
					</div>
				)}
				{body()}
			</Island>
		</>
	);
}
