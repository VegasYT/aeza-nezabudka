import {
	type AppIcon,
	IconBell,
	IconBriefcase,
	IconDocument,
	IconJournal,
	IconRepeat,
	IconUsers,
} from '@shared/ui/icons';

import type { FileRoutesByTo } from '../routeTree.gen';

/** Раздел навигации: адрес, название и значок. */
export interface Section {
	to: keyof FileRoutesByTo;
	label: string;
	icon: AppIcon;
	// Разделы администратора отделены в шапке чертой и не видны роли «Пользователь».
	adminOnly: boolean;
}

/** Разделы веб-панели в порядке навигации. */
export const sections: readonly Section[] = [
	{ to: '/payments', label: 'Платежи', icon: IconDocument, adminOnly: false },
	{
		to: '/notifications',
		label: 'Уведомления',
		icon: IconBell,
		adminOnly: false,
	},
	{
		to: '/recurring-payments',
		label: 'Регулярные платежи',
		icon: IconRepeat,
		adminOnly: true,
	},
	{ to: '/departments', label: 'Отделы', icon: IconBriefcase, adminOnly: true },
	{ to: '/users', label: 'Пользователи', icon: IconUsers, adminOnly: true },
	{ to: '/audit', label: 'Журнал', icon: IconJournal, adminOnly: true },
];
