import { Button, Group, NumberInput, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
	isReminderWindow,
	REMINDER_MAX,
	reminderTiming,
} from '@entities/recurring-payment';
import {
	getApiErrorMessage,
	getApiFieldErrors,
	settingsOptions,
	type SystemSettings,
	updateSettingsMutation,
} from '@shared/api';
import { capitalize } from '@shared/lib/text';
import { Island } from '@shared/ui/island';

import classes from './notifications-page.module.css';

/** Общее окно напоминаний у администратора: за сколько дней до срока бот пишет о платежах без своего окна. */
export function ReminderWindow({
	settings,
	phone,
}: {
	settings: SystemSettings;
	phone: boolean;
}) {
	const queryClient = useQueryClient();
	// Своё значение поля - только пока администратор его правит, иначе поле показывает сервер.
	const [edited, setEdited] = useState<number | string | null>(null);
	const [invalid, setInvalid] = useState(false);
	const save = useMutation({
		...updateSettingsMutation(),
		onSuccess: (saved) => {
			queryClient.setQueryData(settingsOptions().queryKey, saved);
			setEdited(null);
			notifications.show({
				title: 'Окно напоминаний сохранено',
				message: capitalize(reminderTiming(saved.reminderDaysBefore)),
			});
		},
	});
	const value = edited ?? settings.reminderDaysBefore;
	const changed = value !== settings.reminderDaysBefore;
	const serverError = save.error
		? (getApiFieldErrors(save.error).reminderDaysBefore ??
			getApiErrorMessage(save.error))
		: null;

	return (
		<Island aria-labelledby='reminder-window' className={classes.island}>
			<div className={classes.accountText}>
				<Title order={2} id='reminder-window' className={classes.islandTitle}>
					Когда напоминать
				</Title>
				<Text size='sm' c='dimmed'>
					За&nbsp;сколько дней до&nbsp;срока бот пишет о&nbsp;платеже, если
					у&nbsp;платежа нет своего окна. Своё окно задаётся в&nbsp;форме
					платежа.
				</Text>
			</div>
			<form
				noValidate
				className={classes.windowForm}
				onSubmit={(event) => {
					event.preventDefault();

					if (!isReminderWindow(value)) {
						setInvalid(true);

						return;
					}

					save.mutate({ body: { reminderDaysBefore: Number(value) } });
				}}
			>
				<NumberInput
					className={classes.windowField}
					label='За сколько дней до срока'
					// Стрелки поля меньше пальца, на телефоне число набирают с клавиатуры.
					hideControls={phone}
					min={0}
					max={REMINDER_MAX}
					allowDecimal={false}
					allowNegative={false}
					value={value}
					onChange={(next) => {
						setInvalid(false);
						save.reset();
						setEdited(next);
					}}
					description={value === 0 ? 'В\u00a0день срока' : undefined}
					error={
						invalid ? `Число от\u00a00 до\u00a0${REMINDER_MAX}` : serverError
					}
					// Подпись над полем: кнопки рядом стоят вровень с полем.
					inputWrapperOrder={['label', 'description', 'input', 'error']}
				/>
				<Group gap='xs'>
					<Button type='submit' disabled={!changed} loading={save.isPending}>
						Сохранить
					</Button>
					{settings.reminderDaysBefore !==
						settings.reminderDaysBeforeDefault && (
						<Button
							variant='default'
							disabled={save.isPending}
							onClick={() => {
								setInvalid(false);
								save.mutate({ body: { reminderDaysBefore: null } });
							}}
						>
							Как на&nbsp;сервере ({settings.reminderDaysBeforeDefault})
						</Button>
					)}
				</Group>
			</form>
		</Island>
	);
}
