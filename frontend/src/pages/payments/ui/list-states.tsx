import { Button, Skeleton } from '@mantine/core';

import { IconDocument, IconPlus } from '@shared/ui/icons';
import { ListState } from '@shared/ui/list-state';

import classes from './payments-page.module.css';

/** Платежей ещё нет совсем: администратору - добавить платёж, пользователю - кто их добавляет. */
export function NoPayments({ onAdd }: { onAdd?: () => void }) {
	return (
		<ListState
			icon={<IconDocument size={28} />}
			title='Платежей пока нет'
			text={
				onAdd
					? 'Добавьте регулярный платёж: аренду, подписку или сервер. Здесь появятся его сроки оплаты.'
					: 'Регулярные платежи добавляет администратор, после этого они появятся здесь.'
			}
			action={
				onAdd && (
					<Button leftSection={<IconPlus size={18} />} onClick={onAdd}>
						Добавить платёж
					</Button>
				)
			}
		/>
	);
}

/** Строки-заглушки на время первой загрузки. */
export function ListSkeleton() {
	return (
		<div aria-hidden='true'>
			{[38, 52, 44, 60, 48].map((width) => (
				<div
					key={width}
					className={`${classes.filters} ${classes.stateBorder}`}
				>
					<Skeleton height={12} width={`${width}%`} />
					<Skeleton height={30} width={148} />
				</div>
			))}
		</div>
	);
}
