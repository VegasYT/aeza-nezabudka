import {} from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';

import { settingsOptions } from '@shared/api';
import { useCurrentUser } from '@shared/auth';
import { usePhone } from '@shared/lib/media';
import { PageTitle } from '@shared/ui/page-title';

import { usePersonalLink } from '../model/links';
import { GroupChats } from './group-chats';
import classes from './notifications-page.module.css';
import { PersonalTelegram } from './personal-telegram';
import { RemindersAside } from './reminders-aside';

/** Раздел «Уведомления»: личный Telegram, сведения о чатах и образцы, у администратора - группы. */
export function NotificationsPage() {
	const { data: settings } = useSuspenseQuery(settingsOptions());
	const user = useCurrentUser();
	const phone = usePhone();
	const personal = usePersonalLink();
	const status = personal.result.data;

	return (
		<>
			<PageTitle>Уведомления</PageTitle>
			<div className={classes.columns}>
				<div className={classes.primary}>
					<PersonalTelegram
						flow={personal}
						daysBefore={settings.reminderDaysBefore}
						phone={phone}
					/>
					{user?.role === 'admin' && (
						<GroupChats
							botConfigured={status?.botConfigured !== false}
							phone={phone}
						/>
					)}
				</div>
				{status && (
					<div className={classes.secondary}>
						<RemindersAside status={status} settings={settings} />
					</div>
				)}
			</div>
		</>
	);
}
