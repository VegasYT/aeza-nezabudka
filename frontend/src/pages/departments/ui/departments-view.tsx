import { ActionIcon, Table, VisuallyHidden } from '@mantine/core';

import type { Department } from '@shared/api';
import { IconPencil, IconTrash } from '@shared/ui/icons';

import { activePaymentsLabel, paymentsCountLabel } from '../lib/payments-count';
import classes from './departments-page.module.css';

/** Действие с отделом из строки списка. */
export type DepartmentAction = 'rename' | 'delete';

interface DepartmentsViewProps {
	departments: Department[];
	onAction: (action: DepartmentAction, department: Department) => void;
}

function RowActions({
	department,
	onAction,
}: {
	department: Department;
	onAction: DepartmentsViewProps['onAction'];
}) {
	return (
		<>
			<ActionIcon
				variant='subtle'
				color='gray'
				size='lg'
				aria-label={`Переименовать «${department.name}»`}
				title='Переименовать'
				onClick={() => onAction('rename', department)}
			>
				<IconPencil size={19} />
			</ActionIcon>
			<ActionIcon
				variant='subtle'
				color='gray'
				size='lg'
				aria-label={`Удалить «${department.name}»`}
				title='Удалить'
				onClick={() => onAction('delete', department)}
			>
				<IconTrash size={19} />
			</ActionIcon>
		</>
	);
}

/** Таблица отделов для окна от 768 px. */
export function DepartmentsTable({
	departments,
	onAction,
}: DepartmentsViewProps) {
	return (
		<Table
			className={classes.table}
			verticalSpacing={10}
			horizontalSpacing='md'
		>
			<Table.Thead>
				<Table.Tr>
					<Table.Th w='40%'>Название</Table.Th>
					<Table.Th>Действующие платежи</Table.Th>
					<Table.Th className={classes.actions}>
						<VisuallyHidden>Действия</VisuallyHidden>
					</Table.Th>
				</Table.Tr>
			</Table.Thead>
			<Table.Tbody>
				{departments.map((department) => (
					<Table.Tr key={department.id}>
						<Table.Td className={classes.name}>{department.name}</Table.Td>
						<Table.Td>
							{department.paymentsCount > 0 ? (
								<span className={classes.count}>
									{paymentsCountLabel(department.paymentsCount)}
								</span>
							) : (
								<span
									className={classes.count}
									data-none
									aria-label='Нет действующих платежей'
								>
									—
								</span>
							)}
						</Table.Td>
						<Table.Td className={classes.actions}>
							<RowActions department={department} onAction={onAction} />
						</Table.Td>
					</Table.Tr>
				))}
			</Table.Tbody>
		</Table>
	);
}

/** Список отделов для телефона: название, число платежей и кнопки по 44 px. */
export function DepartmentsList({
	departments,
	onAction,
}: DepartmentsViewProps) {
	return (
		<ul className={classes.list}>
			{departments.map((department) => (
				<li key={department.id} className={classes.item}>
					<div className={classes.itemText}>
						<span className={classes.name}>{department.name}</span>
						<span className={classes.count}>
							{department.paymentsCount > 0
								? activePaymentsLabel(department.paymentsCount)
								: 'Нет действующих платежей'}
						</span>
					</div>
					<RowActions department={department} onAction={onAction} />
				</li>
			))}
		</ul>
	);
}
