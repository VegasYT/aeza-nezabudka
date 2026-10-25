import { Alert, Button, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';

import type { TelegramLink } from '@shared/api';
import { formatTimeOfDay } from '@shared/lib/dates';
import {
	IconAlertCircle,
	IconExternalLink,
	IconInfoCircle,
} from '@shared/ui/icons';

import { LinkQr } from './link-qr';
import classes from './notifications-page.module.css';

/** Шаг подключения: заголовок и пояснение под ним. */
export interface LinkStep {
	title: string;
	hint?: string;
}

interface LinkStepsProps {
	link: TelegramLink;
	/** Первый шаг: открыть ссылку; под ним кнопка «Открыть Telegram». */
	open: string;
	steps: LinkStep[];
	qrLabel: string;
	/** QR-код не нужен, когда Telegram на этом же устройстве. */
	showQr: boolean;
	/** Высота кнопок на телефоне. */
	renewing: boolean;
	/** Новую ссылку выдать не удалось: ожидание по прежней продолжается. */
	error?: ReactNode;
	onRenew: () => void;
	onCancel: () => void;
}

/** Шаги подключения по ссылке на бота: кнопка, QR-код, срок ссылки, «Новая ссылка» и «Отмена». */
export function LinkSteps({
	link,
	open,
	steps,
	qrLabel,
	showQr,
	renewing,
	error,
	onRenew,
	onCancel,
}: LinkStepsProps) {
	return (
		<div className={classes.flow}>
			<div className={classes.flowBody}>
				<ol className={classes.steps}>
					<li className={classes.step}>
						<span className={classes.stepNumber} aria-hidden='true'>
							1
						</span>
						<div className={classes.stepText}>
							<Text fw={600}>{open}</Text>
							<Button
								component='a'
								href={link.url}
								target='_blank'
								rel='noopener noreferrer'
								rightSection={<IconExternalLink size={18} />}
							>
								Открыть Telegram
							</Button>
							<Text size='xs' c='dimmed'>
								Откроется в&nbsp;новой вкладке
							</Text>
						</div>
					</li>
					{steps.map((step, index) => (
						<li key={step.title} className={classes.step}>
							<span className={classes.stepNumber} aria-hidden='true'>
								{index + 2}
							</span>
							<div className={classes.stepText}>
								<Text fw={600}>{step.title}</Text>
								{step.hint && (
									<Text size='sm' c='dimmed'>
										{step.hint}
									</Text>
								)}
							</div>
						</li>
					))}
				</ol>
				{showQr && <LinkQr url={link.url} label={qrLabel} />}
			</div>
			{error}
			<LinkFooter
				expiresAt={link.expiresAt}
				renewing={renewing}
				onRenew={onRenew}
				onCancel={onCancel}
			/>
		</div>
	);
}

/** Срок одноразовой ссылки или кода, «Новая ссылка» и «Отмена». */
export function LinkFooter({
	expiresAt,
	code = false,
	renewing,
	onRenew,
	onCancel,
}: Pick<LinkStepsProps, 'renewing' | 'onRenew' | 'onCancel'> & {
	expiresAt: string;
	/** У группы одноразовый код, а не ссылка: другие подписи. */
	code?: boolean;
}) {
	return (
		<div className={classes.flowFooter}>
			<Text size='sm' c='dimmed' className={classes.flowExpiry}>
				{code ? 'Код действует до\u00a0' : 'Ссылка действует до\u00a0'}
				<span className={classes.time}>{formatTimeOfDay(expiresAt)}</span>{' '}
				{code ? 'и\u00a0только для одной темы' : 'и\u00a0только один раз'}
			</Text>
			<Button
				variant='subtle'
				loading={renewing}
				className={classes.accentAction}
				onClick={onRenew}
			>
				{code ? 'Новый код' : 'Новая ссылка'}
			</Button>
			<Button variant='subtle' color='gray' onClick={onCancel}>
				Отмена
			</Button>
		</div>
	);
}

/** Ссылка устарела: объяснение и новая ссылка. */
export function LinkExpired({
	code = false,
	renewing,
	onRenew,
	onCancel,
}: Pick<LinkStepsProps, 'renewing' | 'onRenew' | 'onCancel'> & {
	/** У группы одноразовый код, а не ссылка. */
	code?: boolean;
}) {
	return (
		<>
			<Alert
				variant='light'
				color='cyan'
				role='alert'
				title={code ? 'Код устарел' : 'Ссылка устарела'}
				icon={<IconInfoCircle size={18} />}
				className={classes.notice}
			>
				{code
					? 'Он действует 10\u00a0минут. Получите новый и\u00a0сразу отправьте его в\u00a0Telegram.'
					: 'Она действует 10\u00a0минут. Получите новую и\u00a0откройте её в\u00a0Telegram.'}
			</Alert>
			<Group gap='xs'>
				<Button loading={renewing} onClick={onRenew}>
					{code ? 'Получить новый код' : 'Получить новую ссылку'}
				</Button>
				<Button variant='subtle' color='gray' onClick={onCancel}>
					Отмена
				</Button>
			</Group>
		</>
	);
}

/** Красная плашка с причиной: бот не настроен, Telegram не отвечает, сервер отклонил запрос. */
export function FlowNotice({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<Alert
			variant='light'
			color='red'
			role='alert'
			title={title}
			icon={<IconAlertCircle size={18} />}
			className={classes.notice}
		>
			{children}
		</Alert>
	);
}
