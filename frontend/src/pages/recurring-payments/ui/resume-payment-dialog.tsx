import { Modal, Radio, Stack } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { periodLabel, useRefreshRecurring } from '@entities/recurring-payment';
import { ReminderAlert } from '@features/recurring-payment-form';
import {
	getApiErrorCode,
	getApiErrorMessage,
	getApiFieldErrors,
	type RecurringPayment,
	resumeRecurringPaymentMutation,
	settingsOptions,
} from '@shared/api';
import { formatDate } from '@shared/lib/dates';
import { formatMoney } from '@shared/lib/money';
import {
	DialogActions,
	DialogError,
	DialogSubject,
	DialogText,
} from '@shared/ui/dialog';
import { IconCalendar } from '@shared/ui/icons';

type ResumeMode = 'schedule' | 'date';

function ResumeContent({
	payment,
	onClose,
}: {
	payment: RecurringPayment;
	onClose: () => void;
}) {
	const { data: settings } = useSuspenseQuery(settingsOptions());
	const { today, reminderDaysBefore } = settings;
	const refresh = useRefreshRecurring();
	const [mode, setMode] = useState<ResumeMode>('schedule');
	const [date, setDate] = useState('');
	const [dateError, setDateError] = useState<string | null>(null);
	const resume = useMutation({
		...resumeRecurringPaymentMutation(),
		onSuccess: (resumed) => {
			void refresh();
			onClose();
			notifications.show({
				title: 'Платёж возобновлён',
				message: resumed.nextDueDate
					? `«${resumed.name}»: ближайший срок ${formatDate(resumed.nextDueDate)}.`
					: `«${resumed.name}» снова действует.`,
			});
		},
		onError: (error) => {
			// Платёж уже возобновили в другой вкладке: результат тот же.
			if (getApiErrorCode(error) === 'payment_active') {
				void refresh();
				onClose();

				return;
			}

			setDateError(getApiFieldErrors(error).nextDueDate ?? null);
		},
	});
	const failed =
		resume.error !== null &&
		getApiErrorCode(resume.error) !== 'payment_active' &&
		dateError === null;

	const confirm = () => {
		if (mode === 'date' && date === '') {
			setDateError('Выберите дату ближайшей оплаты');

			return;
		}

		resume.mutate({
			path: { payment_id: payment.id },
			body: mode === 'date' ? { nextDueDate: date } : undefined,
		});
	};

	return (
		<Stack gap='md'>
			<DialogSubject>
				{payment.name}, {formatMoney(payment.amountMinor, payment.currency)}{' '}
				{periodLabel(payment.period, payment.periodCount)}
			</DialogSubject>
			<Radio.Group
				label='С какого срока продолжить'
				value={mode}
				onChange={(value) => {
					setMode(value as ResumeMode);
					setDateError(null);
				}}
			>
				<Stack gap='sm' mt='xs'>
					<Radio
						value='schedule'
						label='По прежнему расписанию'
						description={'Ближайший срок по\u00a0расписанию, сегодня или позже'}
					/>
					<Radio value='date' label='С другой даты' />
				</Stack>
			</Radio.Group>
			{mode === 'date' && (
				<DatePickerInput
					label='Дата ближайшей оплаты'
					placeholder='ДД.ММ.ГГГГ'
					valueFormat='DD.MM.YYYY'
					minDate={today}
					rightSection={<IconCalendar size={18} />}
					rightSectionPointerEvents='none'
					value={date || null}
					onChange={(value) => {
						setDateError(null);
						setDate(value ?? '');
					}}
					error={dateError}
				/>
			)}
			<ReminderAlert
				today={today}
				date={mode === 'date' ? date : ''}
				reminderDaysBefore={reminderDaysBefore}
				after='возобновления'
			/>
			<DialogText quiet>
				Оплаченные и&nbsp;просроченные периоды останутся как были.
			</DialogText>
			{failed && <DialogError>{getApiErrorMessage(resume.error)}</DialogError>}
			<DialogActions
				confirmLabel='Возобновить платёж'
				pending={resume.isPending}
				onCancel={onClose}
				onConfirm={confirm}
			/>
		</Stack>
	);
}

/** Возобновление прекращённого платежа: по прежнему расписанию или с выбранной даты. */
export function ResumePaymentDialog({
	payment,
	opened,
	onClose,
}: {
	payment: RecurringPayment | null;
	opened: boolean;
	onClose: () => void;
}) {
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title='Возобновить платёж?'
			size={480}
		>
			{payment && (
				<ResumeContent key={payment.id} payment={payment} onClose={onClose} />
			)}
		</Modal>
	);
}
