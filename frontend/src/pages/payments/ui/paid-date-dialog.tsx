import { Button, Drawer, Group, Modal, Stack, Text } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { useState } from 'react';

import { formatDays } from '@shared/lib/plural';
import {
	getApiErrorMessage,
	getApiFieldErrors,
	type PaymentOccurrence,
} from '@shared/api';
import { type CalendarDate, daysBetween, formatDate } from '@shared/lib/dates';
import { usePhone } from '@shared/lib/media';
import { formatMoney } from '@shared/lib/money';

import classes from './payments-page.module.css';

export type PaidDateMode = 'other' | 'fix';

function describe(occurrence: PaymentOccurrence, paidOn: string | null) {
	if (!paidOn) {
		return occurrence.overdue
			? `Не оплачено, просрочено ${formatDays(occurrence.daysOverdue)}`
			: 'Не оплачено';
	}

	const late = daysBetween(occurrence.dueDate, paidOn);

	return late > 0
		? `Оплачено ${formatDate(paidOn)}, на\u00a0${late}\u00a0дн. позже срока`
		: `Оплачено ${formatDate(paidOn)}, без просрочки`;
}

function DialogBody({
	occurrence,
	mode,
	today,
	onClose,
	onSubmit,
}: {
	occurrence: PaymentOccurrence;
	mode: PaidDateMode;
	today: CalendarDate;
	onClose: () => void;
	onSubmit: (paidOn: CalendarDate) => Promise<void>;
}) {
	const phone = usePhone();
	const [paidOn, setPaidOn] = useState<string | null>(
		mode === 'fix' ? occurrence.paidOn : null
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const changed = paidOn !== null && paidOn !== occurrence.paidOn;

	const save = async () => {
		if (!paidOn) {
			return;
		}

		setSaving(true);
		setError(null);

		try {
			await onSubmit(paidOn);
			onClose();
		} catch (submitError) {
			setError(
				getApiFieldErrors(submitError).paidOn ??
					getApiErrorMessage(
						submitError,
						'Не удалось сохранить. Проверьте подключение и\u00a0попробуйте ещё раз.'
					)
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Stack gap='md'>
			<div className={classes.dialogAmount}>
				<span className={classes.dialogSum}>
					{formatMoney(occurrence.amountMinor, occurrence.currency)}
				</span>
				<Text size='sm' c='dimmed'>
					срок {formatDate(occurrence.dueDate)}
				</Text>
			</div>
			<Stack gap={6}>
				<Text size='sm' fw={600} id='paid-on-label'>
					Дата оплаты{paidOn ? `: ${formatDate(paidOn)}` : ''}
				</Text>
				<DatePicker
					aria-labelledby='paid-on-label'
					fullWidth={phone}
					size={phone ? 'lg' : undefined}
					value={paidOn}
					onChange={(value) => {
						setPaidOn(value);
						setError(null);
					}}
					maxDate={today}
					defaultDate={paidOn ?? today}
				/>
				{error ? (
					<Text size='xs' c='red' role='alert'>
						{error}
					</Text>
				) : (
					<Text size='xs' c='dimmed'>
						Дата не&nbsp;позже сегодняшней, {formatDate(today)}.
					</Text>
				)}
			</Stack>
			<div className={classes.preview}>
				<span>Сейчас</span>
				<span>{describe(occurrence, occurrence.paidOn)}</span>
				<span>Станет</span>
				<span className={classes.previewAfter}>
					{paidOn ? describe(occurrence, paidOn) : '—'}
				</span>
			</div>
			<Group justify='flex-end' gap='xs'>
				<Button variant='subtle' color='gray' onClick={onClose}>
					Отмена
				</Button>
				<Button disabled={!changed} loading={saving} onClick={save}>
					Сохранить
				</Button>
			</Group>
		</Stack>
	);
}

/** Окно даты оплаты: «Оплачено в другой день» и «Исправить дату» с пересчётом просрочки до сохранения; на телефоне - лист снизу. */
export function PaidDateDialog({
	target,
	today,
	onClose,
	onSubmit,
}: {
	target: { occurrence: PaymentOccurrence; mode: PaidDateMode } | null;
	today: CalendarDate;
	onClose: () => void;
	onSubmit: (
		occurrence: PaymentOccurrence,
		mode: PaidDateMode,
		paidOn: CalendarDate
	) => Promise<void>;
}) {
	const phone = usePhone();
	const title =
		target?.mode === 'fix' ? 'Исправить дату' : 'Оплачено в другой день';
	const body = target && (
		<>
			<Text size='sm' c='dimmed' mb='md'>
				{target.occurrence.recurringPayment.name}
			</Text>
			<DialogBody
				key={target.occurrence.id}
				occurrence={target.occurrence}
				mode={target.mode}
				today={today}
				onClose={onClose}
				onSubmit={(paidOn) => onSubmit(target.occurrence, target.mode, paidOn)}
			/>
		</>
	);

	return phone ? (
		<Drawer
			opened={target !== null}
			onClose={onClose}
			position='bottom'
			classNames={{ content: classes.sheet }}
			title={title}
		>
			{body}
		</Drawer>
	) : (
		<Modal opened={target !== null} onClose={onClose} title={title}>
			{body}
		</Modal>
	);
}
