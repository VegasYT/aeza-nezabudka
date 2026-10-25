import { Button, SegmentedControl } from '@mantine/core';

import type { Currency, OccurrenceStatus } from '@shared/api';
import { IconClose } from '@shared/ui/icons';

import classes from './payments-page.module.css';

const ALL = 'all';

const STATUS_OPTIONS = [
	{ value: ALL, label: 'Все' },
	{ value: 'unpaid', label: 'Не оплачено' },
	{ value: 'overdue', label: 'Просрочено' },
	{ value: 'paid', label: 'Оплачено' },
];

function statusOf(value: string) {
	return value === ALL ? undefined : (value as OccurrenceStatus);
}

/** Статус списка на телефоне: переключатель на всю ширину над карточками. */
export function PhoneStatusFilter({
	status,
	onStatus,
}: {
	status: OccurrenceStatus | undefined;
	onStatus: (status: OccurrenceStatus | undefined) => void;
}) {
	return (
		<SegmentedControl
			fullWidth
			aria-label='Статус'
			value={status ?? ALL}
			onChange={(value) => onStatus(statusOf(value))}
			data={STATUS_OPTIONS}
		/>
	);
}

/** Статус и валюта меняют только список: итоги не принимают этих фильтров. */
export function ListFilters({
	status,
	currency,
	canReset,
	onStatus,
	onCurrency,
	onReset,
}: {
	status: OccurrenceStatus | undefined;
	currency: Currency | undefined;
	canReset: boolean;
	onStatus: (status: OccurrenceStatus | undefined) => void;
	onCurrency: (currency: Currency | undefined) => void;
	onReset: () => void;
}) {
	return (
		<div className={classes.filters}>
			<div className={classes.controls}>
				<SegmentedControl
					aria-label='Статус'
					value={status ?? ALL}
					onChange={(value) => onStatus(statusOf(value))}
					data={STATUS_OPTIONS}
				/>
				<SegmentedControl
					aria-label='Валюта'
					value={currency ?? ALL}
					onChange={(value) =>
						onCurrency(value === ALL ? undefined : (value as Currency))
					}
					data={[
						{ value: ALL, label: 'Все валюты' },
						{ value: 'RUB', label: 'RUB' },
						{ value: 'USD', label: 'USD' },
						{ value: 'EUR', label: 'EUR' },
					]}
				/>
			</div>
			{canReset && (
				<Button
					variant='subtle'
					leftSection={<IconClose size={18} />}
					onClick={onReset}
				>
					Сбросить фильтры
				</Button>
			)}
		</div>
	);
}
