import { Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import {
	createDepartmentMutation,
	type Department,
	getApiErrorCode,
	getApiFieldErrors,
	updateDepartmentMutation,
} from '@shared/api';
import { fieldError } from '@shared/lib/form';
import { DialogActions, DialogError } from '@shared/ui/dialog';

import {
	departmentActionError,
	isDepartmentGone,
	useRefreshDepartments,
} from '../model/departments';

const NAME_MAX = 100;

const schema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Введите название')
		.max(NAME_MAX, `Не длиннее ${NAME_MAX}\u00a0символов`),
});

function DepartmentForm({
	department,
	onClose,
}: {
	/** Переименуемый отдел; без него форма создаёт новый. */
	department: Department | null;
	onClose: () => void;
}) {
	const refresh = useRefreshDepartments();
	const onError = (error: unknown) => isDepartmentGone(error) && refresh();
	const create = useMutation({
		...createDepartmentMutation(),
		onSuccess: refresh,
	});
	const rename = useMutation({
		...updateDepartmentMutation(),
		onSuccess: refresh,
		onError,
	});
	const action = department ? rename : create;
	// Ошибка названия с сервера живёт до следующей правки поля.
	const [serverNameError, setServerNameError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: { name: department?.name ?? '' },
		validators: { onSubmit: schema },
		onSubmit: async ({ value }) => {
			const body = { name: value.name.trim() };

			try {
				if (department) {
					await rename.mutateAsync({
						path: { department_id: department.id },
						body,
					});
				} else {
					await create.mutateAsync({ body });
				}

				onClose();
			} catch (error) {
				const nameError =
					getApiErrorCode(error) === 'department_name_taken'
						? 'Отдел с\u00a0таким названием уже есть'
						: getApiFieldErrors(error).name;

				if (nameError) {
					setServerNameError(nameError);
					action.reset();
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
				<form.Field name='name'>
					{(field) => {
						const error = fieldError(field) ?? serverNameError;

						return (
							<TextInput
								label='Название'
								autoComplete='off'
								placeholder='Например, Склад'
								maxLength={NAME_MAX}
								data-autofocus
								value={field.state.value}
								onChange={(event) => {
									setServerNameError(null);
									field.handleChange(event.target.value);
								}}
								onBlur={field.handleBlur}
								error={error}
								description={
									error
										? undefined
										: department
											? 'Новое название сразу появится в\u00a0платежах, фильтрах и\u00a0напоминаниях.'
											: 'Отдел нужен для фильтров и\u00a0итогов. Права от\u00a0него не\u00a0зависят.'
								}
								inputWrapperOrder={['label', 'input', 'description', 'error']}
							/>
						);
					}}
				</form.Field>
				{action.error && (
					<DialogError>{departmentActionError(action.error)}</DialogError>
				)}
				<DialogActions
					confirmLabel={department ? 'Сохранить' : 'Создать'}
					pending={action.isPending}
					onCancel={onClose}
				/>
			</Stack>
		</form>
	);
}

/** Окно создания отдела или переименования существующего. */
export function DepartmentDialog({
	department,
	opened,
	onClose,
}: {
	department: Department | null;
	opened: boolean;
	onClose: () => void;
}) {
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title={department ? 'Переименовать отдел' : 'Новый отдел'}
			size={440}
		>
			<DepartmentForm
				key={department?.id ?? 'new'}
				department={department}
				onClose={onClose}
			/>
		</Modal>
	);
}
