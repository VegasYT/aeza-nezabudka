import { Alert, Button, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';

import { IconAlertCircle, IconInfoCircle } from '@shared/ui/icons';

import classes from './dialog.module.css';

/** Строка под заголовком окна: email участника, название отдела. */
export function DialogSubject({ children }: { children: ReactNode }) {
	return (
		<Text c='dimmed' className={classes.subject}>
			{children}
		</Text>
	);
}

/** Пояснение в окне: голубая плашка со значком «i». */
export function DialogInfo({ children }: { children: ReactNode }) {
	return (
		<Alert variant='light' color='cyan' icon={<IconInfoCircle size={18} />}>
			{children}
		</Alert>
	);
}

/** Причина, по которой сервер отклонил действие. */
export function DialogError({ children }: { children: ReactNode }) {
	return (
		<Alert
			variant='light'
			color='red'
			role='alert'
			icon={<IconAlertCircle size={18} />}
		>
			{children}
		</Alert>
	);
}

interface DialogActionsProps {
	confirmLabel: string;
	danger?: boolean;
	pending: boolean;
	disabled?: boolean;
	onCancel: () => void;
	/** Без обработчика кнопка подтверждения отправляет форму. */
	onConfirm?: () => void;
}

/** Кнопки окна: «Отмена» и подтверждение, красное для необратимых действий. */
export function DialogActions({
	confirmLabel,
	danger = false,
	pending,
	disabled = false,
	onCancel,
	onConfirm,
}: DialogActionsProps) {
	return (
		<Group justify='flex-end' gap='xs' mt='xs'>
			<Button variant='subtle' color='gray' onClick={onCancel}>
				Отмена
			</Button>
			<Button
				type={onConfirm ? 'button' : 'submit'}
				color={danger ? 'red' : undefined}
				loading={pending}
				disabled={disabled}
				onClick={onConfirm}
			>
				{confirmLabel}
			</Button>
		</Group>
	);
}

/** Абзац пояснения в окне подтверждения. */
export function DialogText({
	children,
	quiet = false,
}: {
	children: ReactNode;
	quiet?: boolean;
}) {
	return (
		<Text
			className={classes.text}
			size={quiet ? 'sm' : 'md'}
			c={quiet ? 'dimmed' : undefined}
		>
			{children}
		</Text>
	);
}
