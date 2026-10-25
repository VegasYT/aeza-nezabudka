import { Select } from '@mantine/core';
import { DatePickerInput, type DatesRangeValue } from '@mantine/dates';
import { useState } from 'react';

import type { User } from '@shared/api';
import type { CalendarDate } from '@shared/lib/dates';
import { IconCalendar } from '@shared/ui/icons';

import { ACTION_GROUPS, type AuditSearch } from '../model/audit-search';
import classes from './audit-log-page.module.css';

// Значение «все» в выпадающих списках; в адрес не пишется.
const ALL = 'all';

interface AuditFiltersProps {
	search: AuditSearch;
	period: { from: CalendarDate; to: CalendarDate };
	today: CalendarDate;
	members: User[] | undefined;
	phone: boolean;
	onChange: (changes: Partial<AuditSearch>) => void;
}

/** Фильтры журнала: действие, кто и когда. На телефоне - в ряд с прокруткой, без подписей. */
export function AuditFilters({
	search,
	period,
	today,
	members,
	phone,
	onChange,
}: AuditFiltersProps) {
	// Пока выбрана только первая дата, адрес не меняется.
	const [draft, setDraft] = useState<DatesRangeValue<string> | null>(null);
	const emails = (members ?? []).map((member) => member.email);
	// Записи удалённого участника остаются в журнале: его email из адреса тоже можно выбрать.
	const actors =
		search.actor && !emails.includes(search.actor)
			? [...emails, search.actor]
			: emails;
	const size = phone ? 'md' : 'sm';
	const label = (text: string) => (phone ? undefined : text);

	return (
		<div className={phone ? classes.filtersRow : classes.filters}>
			<Select
				label={label('Действие')}
				aria-label={phone ? 'Действие' : undefined}
				size={size}
				className={classes.actionFilter}
				allowDeselect={false}
				value={search.action ?? ALL}
				data={[
					{ value: ALL, label: 'Все действия' },
					...ACTION_GROUPS.map(({ value, label: text }) => ({
						value,
						label: text,
					})),
				]}
				onChange={(value) =>
					onChange({
						action:
							value === ALL || value === null
								? undefined
								: (value as AuditSearch['action']),
					})
				}
			/>
			<Select
				label={label('Кто')}
				aria-label={phone ? 'Кто' : undefined}
				size={size}
				className={classes.actorFilter}
				searchable
				allowDeselect={false}
				nothingFoundMessage='Никого не нашлось'
				value={search.actor ?? ALL}
				data={[
					{ value: ALL, label: 'Все участники' },
					...actors.map((email) => ({ value: email, label: email })),
				]}
				onChange={(value) =>
					onChange({
						actor: value === ALL || value === null ? undefined : value,
					})
				}
			/>
			<DatePickerInput
				type='range'
				label={label('Когда')}
				aria-label={phone ? 'Когда' : undefined}
				size={size}
				className={classes.periodFilter}
				leftSection={<IconCalendar size={17} />}
				valueFormat='DD.MM.YYYY'
				labelSeparator='–'
				maxDate={today}
				allowSingleDateInRange
				dropdownType={phone ? 'modal' : 'popover'}
				numberOfColumns={phone ? 1 : 2}
				value={draft ?? [period.from, period.to]}
				onChange={(value) => {
					const [from, to] = value;

					if (!from || !to) {
						setDraft(value);

						return;
					}

					setDraft(null);
					onChange({ from, to });
				}}
				onDropdownClose={() => setDraft(null)}
			/>
		</div>
	);
}
