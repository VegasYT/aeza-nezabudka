import { Alert } from '@mantine/core';

import { inReminderWindow } from '@entities/recurring-payment';
import { type CalendarDate, daysBetween } from '@shared/lib/dates';
import { formatDays } from '@shared/lib/plural';
import { IconBell } from '@shared/ui/icons';

/** Предупреждение, что срок в окне напоминания и напоминание уйдёт сразу; вне окна ничего не рисует. */
export function ReminderAlert({
	today,
	date,
	reminderDaysBefore,
	after,
	className,
}: {
	today: CalendarDate;
	/** Выбранный срок; пустая строка - срок не выбран. */
	date: CalendarDate | '';
	reminderDaysBefore: number;
	/** После чего уйдёт напоминание: «сохранения», «возобновления». */
	after: string;
	className?: string;
}) {
	if (date === '' || !inReminderWindow(today, date, reminderDaysBefore)) {
		return null;
	}

	const daysLeft = daysBetween(today, date);

	return (
		<Alert
			className={className}
			variant='light'
			color='yellow'
			icon={<IconBell size={18} />}
		>
			<strong>
				{daysLeft === 0
					? 'Срок сегодня.'
					: daysLeft === 1
						? 'Срок завтра.'
						: `Срок через ${formatDays(daysLeft)}.`}
			</strong>{' '}
			Напоминание отправится в&nbsp;подключённые чаты сразу после {after}.
		</Alert>
	);
}
