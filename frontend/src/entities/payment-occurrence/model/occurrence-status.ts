import type { PaymentOccurrence } from '@shared/api';
import { type CalendarDate, daysBetween } from '@shared/lib/dates';
import { formatDays } from '@shared/lib/plural';

/** Вид статуса: от него зависят значок и цвет. */
export type StatusTone = 'paid' | 'late' | 'overdue' | 'soon' | 'waiting';

export interface OccurrenceStatus {
	tone: StatusTone;
	label: string;
	/** Подпись под статусом: «срок через 7 дней». */
	hint: string | null;
	/** Дни для колонки «Просрочка»: просрочка или опоздание оплаты; `null` - пусто. */
	lateDays: number | null;
}

type StatusSource = Pick<
	PaymentOccurrence,
	'dueDate' | 'paid' | 'overdue' | 'daysOverdue'
>;

/**
 * Статус периода по словарю макетов. Просрочку считает сервер (`overdue`, `daysOverdue`),
 * здесь только дни до срока от сегодня сервера.
 */
export function occurrenceStatus(
	occurrence: StatusSource,
	today: CalendarDate,
	reminderDaysBefore: number
): OccurrenceStatus {
	const { paid, overdue, daysOverdue } = occurrence;

	if (paid) {
		return overdue
			? {
					tone: 'late',
					label: 'Оплачено с опозданием',
					hint: null,
					lateDays: daysOverdue,
				}
			: { tone: 'paid', label: 'Оплачено', hint: null, lateDays: null };
	}

	if (overdue) {
		return {
			tone: 'overdue',
			label: 'Просрочено',
			hint: null,
			lateDays: daysOverdue,
		};
	}

	const daysLeft = daysBetween(today, occurrence.dueDate);

	if (daysLeft <= reminderDaysBefore) {
		const label =
			daysLeft <= 0
				? 'Срок сегодня'
				: daysLeft === 1
					? 'Срок завтра'
					: `Срок через ${formatDays(daysLeft)}`;

		return { tone: 'soon', label, hint: null, lateDays: null };
	}

	return {
		tone: 'waiting',
		label: 'Не оплачено',
		hint: `срок через ${formatDays(daysLeft)}`,
		lateDays: null,
	};
}
