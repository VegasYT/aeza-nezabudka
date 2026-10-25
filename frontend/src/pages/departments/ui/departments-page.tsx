import { Button, Skeleton, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Department } from '@shared/api';
import { departmentsOptions } from '@shared/api';
import { usePhone } from '@shared/lib/media';
import { AddButton } from '@shared/ui/add-button';
import { Island } from '@shared/ui/island';
import { LoadError } from '@shared/ui/list-state';
import { PageTitle } from '@shared/ui/page-title';

import { DeleteDepartmentDialog } from './delete-department-dialog';
import { DepartmentDialog } from './department-dialog';
import classes from './departments-page.module.css';
import {
	type DepartmentAction,
	DepartmentsList,
	DepartmentsTable,
} from './departments-view';

type DialogKind = 'edit' | 'delete';

// Отдел окна остаётся в состоянии и после закрытия: окно гаснет, не теряя содержимого.
interface DialogState {
	kind: DialogKind;
	department: Department | null;
	opened: boolean;
}

function Empty({ onAdd }: { onAdd: () => void }) {
	return (
		<div className={classes.empty}>
			<svg viewBox='0 0 480 120' aria-hidden className={classes.pattern}>
				<rect width='480' height='120' rx='10' className={classes.patternKey} />
				<path
					d='M0 84H480M0 98H480M0 112H480'
					className={classes.patternAccent}
				/>
				<path
					d='M64 0V120M78 0V120M92 0V120'
					className={classes.patternGlyph}
				/>
				<path
					d='M112 0V22a22 22 0 0 0 22 22H480'
					className={classes.patternAccent}
				/>
				<path
					d='M318 0V44a20 20 0 0 0 20 20H480'
					className={classes.patternGlyph}
				/>
			</svg>
			<span className={classes.emptyTitle}>Отделов пока нет</span>
			<Text c='dimmed' maw={560}>
				Отделы необязательны. С&nbsp;ними платежи можно делить в&nbsp;фильтрах
				и&nbsp;итогах, например на&nbsp;«Офис» и&nbsp;«ИТ».
			</Text>
			<Button variant='light' mt={4} onClick={onAdd}>
				Добавить отдел
			</Button>
		</div>
	);
}

/** Раздел «Отделы»: справочник отделов для фильтров и итогов. */
export function DepartmentsPage() {
	const phone = usePhone();
	const departments = useQuery(departmentsOptions());
	const [dialog, setDialog] = useState<DialogState>({
		kind: 'edit',
		department: null,
		opened: false,
	});

	const open = (kind: DialogKind, department: Department | null = null) =>
		setDialog({ kind, department, opened: true });
	const close = () => setDialog((state) => ({ ...state, opened: false }));
	const onAction = (action: DepartmentAction, department: Department) =>
		open(action === 'rename' ? 'edit' : 'delete', department);

	const items = departments.data?.items ?? [];
	const total = departments.data?.total ?? 0;

	return (
		<>
			<div className={classes.head}>
				<PageTitle
					note={
						phone ? null : (
							<>
								для фильтров и&nbsp;итогов, права от&nbsp;отделов
								не&nbsp;зависят
							</>
						)
					}
				>
					Отделы
				</PageTitle>
				<AddButton label='Добавить отдел' onClick={() => open('edit')} />
			</div>

			<Island
				className={classes.island}
				aria-label='Отделы'
				aria-busy={departments.isPending}
			>
				{departments.isPending && (
					<div className={classes.skeleton}>
						<Skeleton height={20} width='40%' />
						<Skeleton height={20} width='55%' />
					</div>
				)}
				{departments.isError && (
					<LoadError
						title='Не удалось загрузить отделы'
						onRetry={() => void departments.refetch()}
					/>
				)}
				{departments.isSuccess && items.length === 0 && (
					<Empty onAdd={() => open('edit')} />
				)}
				{items.length > 0 &&
					(phone ? (
						<DepartmentsList departments={items} onAction={onAction} />
					) : (
						<DepartmentsTable departments={items} onAction={onAction} />
					))}
				{total > items.length && (
					<Text size='xs' c='dimmed' className={classes.footer}>
						Показаны первые {items.length} из&nbsp;{total}
					</Text>
				)}
			</Island>
			{phone && items.length > 0 && (
				<Text size='sm' c='dimmed' className={classes.subtitle}>
					Отделы нужны для фильтров и&nbsp;итогов. Права от&nbsp;них
					не&nbsp;зависят.
				</Text>
			)}

			<DepartmentDialog
				department={dialog.department}
				opened={dialog.opened && dialog.kind === 'edit'}
				onClose={close}
			/>
			<DeleteDepartmentDialog
				department={dialog.department}
				opened={dialog.opened && dialog.kind === 'delete'}
				onClose={close}
			/>
		</>
	);
}
