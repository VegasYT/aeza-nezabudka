import { Button, CopyButton, Text } from '@mantine/core';
import type { ReactNode } from 'react';

import type { GroupChatLink } from '@shared/api';
import { IconCheck, IconCopy, IconExternalLink } from '@shared/ui/icons';

import { LinkFooter } from './link-flow-view';
import { LinkQr } from './link-qr';
import classes from './notifications-page.module.css';

interface GroupLinkStepsProps {
	link: GroupChatLink;
	/** Название группы, к которой бота возвращают; без него - подключение новой. */
	reconnecting: string | null;
	/** QR-код не нужен, когда Telegram на этом же устройстве. */
	showQr: boolean;
	renewing: boolean;
	/** Новый код получить не удалось: ожидание по прежнему коду продолжается. */
	error?: ReactNode;
	onRenew: () => void;
	onCancel: () => void;
}

/** Два способа подключить группу одним кодом: добавить бота по ссылке или отправить команду в теме. */
export function GroupLinkSteps({
	link,
	reconnecting,
	showQr,
	renewing,
	error,
	onRenew,
	onCancel,
}: GroupLinkStepsProps) {
	return (
		<div className={classes.flow}>
			<div className={classes.flowBody}>
				<section
					className={`${classes.linkOption} ${classes.addBot}`}
					aria-labelledby='group-add-bot'
				>
					<Text fw={600} id='group-add-bot'>
						{reconnecting
							? `Верните бота в\u00a0группу «${reconnecting}»`
							: 'Добавить бота в\u00a0группу'}
					</Text>
					<Text size='sm' c='dimmed'>
						{reconnecting
							? 'Откройте ссылку, выберите эту группу и\u00a0подтвердите добавление бота. Отделы группы останутся прежними.'
							: 'Откройте ссылку, выберите группу и\u00a0подтвердите добавление бота. Сообщения пойдут без темы. В\u00a0группе с\u00a0темами бот пришлёт в\u00a0«Общее» команду, отправьте её в\u00a0нужной теме.'}
					</Text>
					<Button
						component='a'
						href={link.url}
						target='_blank'
						rel='noopener noreferrer'
						rightSection={<IconExternalLink size={18} />}
					>
						Открыть Telegram
					</Button>
				</section>
				{showQr && <LinkQr url={link.url} label='QR-код ссылки для группы' />}
			</div>
			<section
				className={`${classes.linkOption} ${classes.byCommand}`}
				aria-labelledby='group-command'
			>
				<Text fw={600} id='group-command'>
					Если бот уже в&nbsp;группе, отправьте в&nbsp;нужной теме
				</Text>
				<div className={classes.command}>
					<code className={classes.commandText}>{link.command}</code>
					<CopyButton value={link.command}>
						{({ copied, copy }) => (
							<Button
								variant='default'
								size='xs'
								leftSection={
									copied ? <IconCheck size={16} /> : <IconCopy size={16} />
								}
								onClick={copy}
							>
								{copied ? 'Скопировано' : 'Копировать'}
							</Button>
						)}
					</CopyButton>
				</div>
				<Text size='sm' c='dimmed'>
					Чтобы бот писал в&nbsp;«Общее», отправьте команду там&nbsp;же. Для
					каждой темы нужен свой код, новый код заменяет прежний.
				</Text>
			</section>
			{error}
			<LinkFooter
				code
				expiresAt={link.expiresAt}
				renewing={renewing}
				onRenew={onRenew}
				onCancel={onCancel}
			/>
		</div>
	);
}
