import { ActionIcon, Button, Loader, Menu } from '@mantine/core';

import type { PaymentOccurrence } from '@shared/api';
import {
	IconCalendarCheck,
	IconCheck,
	IconDots,
	IconPencil,
	IconUndo,
} from '@shared/ui/icons';

import { occurrenceTitle } from '../model/wording';
import classes from './payments-page.module.css';

/** Что сделать с периодом: открыть окно даты или отменить оплату. */
export interface OccurrenceHandlers {
	onMark: (occurrence: PaymentOccurrence) => void;
	onPickDate: (occurrence: PaymentOccurrence, mode: 'other' | 'fix') => void;
	onUnmark: (occurrence: PaymentOccurrence) => void;
}

/** Меню действий с периодом: другие даты оплаты и отмена. */
export function OccurrenceMenu({
	occurrence,
	disabled,
	onPickDate,
	onUnmark,
}: Omit<OccurrenceHandlers, 'onMark'> & {
	occurrence: PaymentOccurrence;
	disabled: boolean;
}) {
	return (
		<Menu position='bottom-end' width={252}>
			<Menu.Target>
				<ActionIcon
					variant='subtle'
					color='gray'
					size='lg'
					disabled={disabled}
					aria-label={`Действия: ${occurrenceTitle(occurrence)}`}
				>
					<IconDots size={18} />
				</ActionIcon>
			</Menu.Target>
			<Menu.Dropdown>
				{occurrence.paid ? (
					<>
						<Menu.Item
							leftSection={<IconPencil size={20} />}
							onClick={() => onPickDate(occurrence, 'fix')}
						>
							Исправить дату
						</Menu.Item>
						<Menu.Item
							color='var(--mantine-color-error)'
							leftSection={<IconUndo size={20} />}
							onClick={() => onUnmark(occurrence)}
						>
							Отменить оплату
						</Menu.Item>
					</>
				) : (
					<Menu.Item
						leftSection={<IconCalendarCheck size={20} />}
						onClick={() => onPickDate(occurrence, 'other')}
					>
						Оплачено в другой день
					</Menu.Item>
				)}
			</Menu.Dropdown>
		</Menu>
	);
}

/** «Оплачено» с галочкой, чтобы действие не путали со статусом, или «Сохраняем…», пока идёт запись. */
export function MarkButton({
	occurrence,
	saving,
	onMark,
	fullWidth,
}: {
	occurrence: PaymentOccurrence;
	saving: boolean;
	onMark: (occurrence: PaymentOccurrence) => void;
	fullWidth?: boolean;
}) {
	return (
		<Button
			className={classes.mark}
			variant='light'
			fullWidth={fullWidth}
			disabled={saving}
			aria-label={
				saving ? undefined : `Оплачено: ${occurrenceTitle(occurrence)}`
			}
			leftSection={
				saving ? (
					<Loader size={14} color='currentColor' />
				) : (
					<IconCheck size={16} />
				)
			}
			onClick={() => onMark(occurrence)}
		>
			{saving ? 'Сохраняем…' : 'Оплачено'}
		</Button>
	);
}
