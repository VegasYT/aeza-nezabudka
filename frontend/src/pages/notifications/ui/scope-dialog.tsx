import { Checkbox, Modal, Radio, Skeleton, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { departmentsOptions } from '@shared/api';
import { DialogActions, DialogError, DialogSubject } from '@shared/ui/dialog';

import classes from './notifications-page.module.css';

interface ScopeFormProps {
	/** Текущий фильтр: `null` - все платежи. */
	departmentIds: readonly string[] | null;
	pending: boolean;
	error: string | null;
	onSave: (departmentIds: string[] | null) => void;
	onClose: () => void;
}

function ScopeForm({
	departmentIds,
	pending,
	error,
	onSave,
	onClose,
}: ScopeFormProps) {
	const departments = useQuery(departmentsOptions());
	const [all, setAll] = useState(departmentIds === null);
	const [selected, setSelected] = useState<readonly string[]>(
		departmentIds ?? []
	);
	const items = departments.data?.items ?? [];
	const chosen = items
		.filter((department) => selected.includes(department.id))
		.map((department) => department.id);
	const noDepartments = departments.isSuccess && items.length === 0;
	const invalid = !all && chosen.length === 0;

	const toggle = (id: string, checked: boolean) =>
		setSelected((current) =>
			checked ? [...current, id] : current.filter((item) => item !== id)
		);

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();

				if (!invalid) {
					onSave(all ? null : chosen);
				}
			}}
		>
			<Stack gap='md'>
				<Radio.Group
					name='scope'
					value={all ? 'all' : 'some'}
					onChange={(value) => setAll(value === 'all')}
				>
					<Stack gap='sm'>
						<Radio
							value='all'
							label='Все платежи'
							description={'в\u00a0том числе без отдела'}
						/>
						<Radio
							value='some'
							label='Только выбранные отделы'
							description={
								noDepartments
									? 'отделов пока нет'
									: 'платежи без отдела не\u00a0приходят'
							}
							disabled={noDepartments}
						/>
					</Stack>
				</Radio.Group>
				{departments.isPending && <Skeleton height={20} width='50%' />}
				{departments.isError && (
					<DialogError>Не удалось загрузить отделы.</DialogError>
				)}
				{items.length > 0 && (
					<div role='group' aria-label='Отделы' className={classes.scopeList}>
						{items.map((department) => (
							<Checkbox
								key={department.id}
								label={department.name}
								checked={!all && selected.includes(department.id)}
								disabled={all}
								onChange={(event) =>
									toggle(department.id, event.currentTarget.checked)
								}
							/>
						))}
					</div>
				)}
				{invalid && (
					<Text size='xs' fw={500} c='red' role='alert'>
						Отметьте хотя&nbsp;бы один отдел или выберите «Все платежи».
					</Text>
				)}
				{error && <DialogError>{error}</DialogError>}
				<DialogActions
					confirmLabel='Сохранить'
					pending={pending}
					disabled={invalid}
					onCancel={onClose}
				/>
			</Stack>
		</form>
	);
}

/** Окно «Какие платежи присылать»: все платежи или только выбранных отделов; общее для себя и групп. */
export function ScopeDialog({
	opened,
	subject,
	targetKey,
	...form
}: ScopeFormProps & {
	opened: boolean;
	/** Кому приходят напоминания: «вам лично в Telegram», «в группу «Бухгалтерия»». */
	subject: string;
	/** Смена получателя сбрасывает выбор в окне. */
	targetKey: string;
}) {
	return (
		<Modal
			opened={opened}
			onClose={form.onClose}
			title='Какие платежи присылать'
			size={440}
		>
			<Stack gap='md'>
				<DialogSubject>{subject}</DialogSubject>
				<ScopeForm key={targetKey} {...form} />
			</Stack>
		</Modal>
	);
}
