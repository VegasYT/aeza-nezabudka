import { Text, Title } from '@mantine/core';

import type { SystemSettings, TelegramStatus } from '@shared/api';
import { Island } from '@shared/ui/island';

import { reminderSamples } from '../lib/wording';
import classes from './notifications-page.module.css';
import { TelegramMark } from './telegram-mark';

/** Правая колонка: подключены ли общий и групповые чаты и как выглядят напоминания бота. */
export function RemindersAside({
	status,
	settings,
}: {
	status: TelegramStatus;
	settings: SystemSettings;
}) {
	// Без бота сервер ничего не отправит, даже если чат указан в настройках.
	const connected = status.groupChatConfigured && status.botConfigured;
	const { dueSoon, overdue } = reminderSamples(
		settings.today,
		settings.reminderDaysBefore
	);

	return (
		<>
			<Island aria-labelledby='group-chat' className={classes.island}>
				<div className={classes.islandHead}>
					<Title order={2} id='group-chat' className={classes.islandTitle}>
						Общий и&nbsp;групповые чаты
					</Title>
					<span className={classes.status}>
						<TelegramMark tone={connected ? 'on' : 'off'} />
						<span
							className={connected ? classes.statusStrong : classes.statusQuiet}
						>
							{connected ? 'Подключены' : 'Не подключены'}
						</span>
					</span>
				</div>
				<Text c='dimmed' className={classes.lead}>
					{connected
						? 'Бот пишет о\u00a0платежах в\u00a0общий чат бухгалтерии или в\u00a0групповые чаты. Это не\u00a0зависит от\u00a0ваших личных напоминаний.'
						: 'Ни общий чат, ни\u00a0групповые чаты пока не\u00a0подключены.'}
				</Text>
			</Island>
			<Island aria-labelledby='reminder-samples' className={classes.island}>
				<div className={classes.accountText}>
					<Title
						order={2}
						id='reminder-samples'
						className={classes.islandTitle}
					>
						Как выглядят напоминания
					</Title>
					<Text size='sm' c='dimmed'>
						Одинаково во&nbsp;всех чатах. О&nbsp;каждом сроке бот пишет
						не&nbsp;больше двух раз.
						{settings.receiptsEnabled &&
							' Чтобы приложить чек, ответьте файлом на\u00a0сообщение бота.'}
					</Text>
				</div>
				{[dueSoon, overdue].map((sample) => (
					<figure key={sample.caption} className={classes.sample}>
						<figcaption className={classes.sampleCaption}>
							{sample.caption}
						</figcaption>
						<blockquote className={classes.sampleText}>
							{sample.text}
						</blockquote>
					</figure>
				))}
			</Island>
		</>
	);
}
