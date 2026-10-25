import { Button, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { IconAlertCircle, IconRefresh } from '@shared/ui/icons';

import classes from './list-state.module.css';

/** Пустой список или ошибка внутри острова: значок, заголовок, пояснение и действие. */
export function ListState({
	icon,
	tone,
	title,
	text,
	action,
}: {
	icon: ReactNode;
	tone?: 'done' | 'error';
	title: string;
	text: string;
	action?: ReactNode;
}) {
	const iconClass =
		tone === 'done'
			? `${classes.icon} ${classes.iconDone}`
			: tone === 'error'
				? `${classes.icon} ${classes.iconError}`
				: classes.icon;

	return (
		<div
			role={tone === 'error' ? 'alert' : undefined}
			className={classes.state}
		>
			<span className={iconClass}>{icon}</span>
			<Title order={2}>{title}</Title>
			<Text className={classes.text}>{text}</Text>
			{action}
		</div>
	);
}

/** Не удалось загрузить список: «Не удалось загрузить платежи» и повтор запроса. */
export function LoadError({
	title,
	onRetry,
}: {
	title: string;
	onRetry: () => void;
}) {
	return (
		<ListState
			tone='error'
			icon={<IconAlertCircle size={28} />}
			title={title}
			text={'Проверьте подключение и\u00a0попробуйте ещё раз.'}
			action={
				<Button
					variant='light'
					leftSection={<IconRefresh size={20} />}
					onClick={onRetry}
				>
					Повторить
				</Button>
			}
		/>
	);
}
