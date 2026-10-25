import { Modal, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import {
	createUserMutation,
	getApiErrorCode,
	getApiFieldErrors,
	type MemberRole,
} from '@shared/api';
import { fieldError } from '@shared/lib/form';
import { DialogActions, DialogError, DialogSubject } from '@shared/ui/dialog';

import { memberActionError, useRefreshMembers } from '../model/members';
import { RoleChoice } from './role-choice';

const schema = z.object({
	email: z.string().trim().min(1, 'Введите email'),
	role: z.enum(['user', 'integration']),
});

function AddMemberForm({ onClose }: { onClose: () => void }) {
	const refresh = useRefreshMembers();
	const create = useMutation({ ...createUserMutation(), onSuccess: refresh });
	// Ошибка email с сервера живёт до следующей правки поля.
	const [serverEmailError, setServerEmailError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: { email: '', role: 'user' as MemberRole },
		validators: { onSubmit: schema },
		onSubmit: async ({ value }) => {
			try {
				await create.mutateAsync({
					body: { email: value.email.trim(), role: value.role },
				});
				onClose();
			} catch (error) {
				const emailError =
					getApiErrorCode(error) === 'login_taken'
						? 'Этот email уже есть в\u00a0списке'
						: getApiFieldErrors(error).email;

				if (emailError) {
					setServerEmailError(emailError);
					create.reset();
				}
			}
		},
	});

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<Stack gap='md'>
				<DialogSubject>Участник входит своим аккаунтом Aéza</DialogSubject>
				<form.Field name='email'>
					{(field) => (
						<TextInput
							label='Email аккаунта Aéza'
							type='email'
							autoComplete='off'
							placeholder='name@company.ru'
							data-autofocus
							value={field.state.value}
							onChange={(event) => {
								setServerEmailError(null);
								field.handleChange(event.target.value);
							}}
							onBlur={field.handleBlur}
							error={fieldError(field) ?? serverEmailError}
							description={
								fieldError(field) || serverEmailError
									? undefined
									: 'С\u00a0этим email входят в\u00a0my.aeza.ru. Аккаунт проверится при первом входе.'
							}
							inputWrapperOrder={['label', 'input', 'description', 'error']}
						/>
					)}
				</form.Field>
				<form.Field name='role'>
					{(field) => (
						<RoleChoice
							value={field.state.value}
							onChange={(role) => field.handleChange(role)}
						/>
					)}
				</form.Field>
				<Text size='xs' c='dimmed' mt={-6}>
					Роль «Администратор» задаётся только в&nbsp;настройках сервера.
				</Text>
				{create.error && (
					<DialogError>{memberActionError(create.error)}</DialogError>
				)}
				<DialogActions
					confirmLabel='Добавить'
					pending={create.isPending}
					onCancel={onClose}
				/>
			</Stack>
		</form>
	);
}

/** Окно «Добавить участника»: email аккаунта Aéza и роль. */
export function AddMemberDialog({
	opened,
	onClose,
}: {
	opened: boolean;
	onClose: () => void;
}) {
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title='Добавить участника'
			size={440}
		>
			<AddMemberForm onClose={onClose} />
		</Modal>
	);
}
