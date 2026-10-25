import { IconBase } from '@shared/ui/icons';

import type { EntryKind } from '../lib/describe-entry';
import classes from './audit-log-page.module.css';

// Контуры из макета журнала: нужны только этому разделу.
const PATHS: Record<EntryKind, string> = {
	login:
		'M15 4H18A2 2 0 0 1 20 6V18A2 2 0 0 1 18 20H15M10 8L14 12L10 16M14 12H4',
	logout: 'M9 4H6A2 2 0 0 0 4 6V18A2 2 0 0 0 6 20H9M15 8L19 12L15 16M19 12H9',
	paid: 'M8.5 12.5L11 15L15.5 9.5M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z',
	unpaid:
		'M9.5 9.5L14.5 14.5M14.5 9.5L9.5 14.5M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z',
	date: 'M8 3V6M16 3V6M4 10H20M6 5H18A2 2 0 0 1 20 7V18A2 2 0 0 1 18 20H6A2 2 0 0 1 4 18V7A2 2 0 0 1 6 5Z',
	create: 'M12 5.25V18.75M5.25 12H18.75',
	edit: 'M4 20H8L18.5 9.5A2.12 2.12 0 0 0 15.5 6.5L5 17V20ZM13.5 8.5L16.5 11.5',
	stop: 'M5.6 5.6L18.4 18.4M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z',
	remove:
		'M5 7.5H19M10 11V16M14 11V16M6.5 7.5L7.2 17.6C7.28 18.7 8.2 19.5 9.29 19.5H14.71C15.8 19.5 16.72 18.7 16.8 17.6L17.5 7.5M9.5 7.5V5.5C9.5 4.95 9.95 4.5 10.5 4.5H13.5C14.05 4.5 14.5 4.95 14.5 5.5V7.5',
	member:
		'M5 19V18A4 4 0 0 1 9 14H15A4 4 0 0 1 19 18V19M12 11A3.5 3.5 0 1 0 12 4A3.5 3.5 0 0 0 12 11Z',
	memberAdd:
		'M3 19V18A4 4 0 0 1 7 14H11A4 4 0 0 1 15 18V19M9 11A3.5 3.5 0 1 0 9 4A3.5 3.5 0 0 0 9 11ZM18.5 8V14M15.5 11H21.5',
	chat: 'M20.5 4.5L3.5 11L9.5 13.5M20.5 4.5L17.5 19.5L9.5 13.5M20.5 4.5L9.5 13.5M9.5 13.5V18.5L12.5 15.75',
	postpone:
		'M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12ZM12 7V12L15 14',
	other: 'M12 12.01V12M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z',
};

/** Значок действия журнала: оплата зелёная, отмена оплаты красная, остальное приглушено. */
export function EntryIcon({
	kind,
	size = 18,
}: {
	kind: EntryKind;
	size?: number;
}) {
	const tone =
		kind === 'paid'
			? classes.iconPaid
			: kind === 'unpaid'
				? classes.iconUnpaid
				: classes.icon;

	return (
		<IconBase size={size} className={tone}>
			<path d={PATHS[kind]} />
		</IconBase>
	);
}
