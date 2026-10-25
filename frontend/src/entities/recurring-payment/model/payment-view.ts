import type { Currency, RecurringPayment } from '@shared/api';
import { getApiErrorCode } from '@shared/api';
import {
	addDays,
	type CalendarDate,
	formatDate,
	formatMoment,
} from '@shared/lib/dates';

import { dueDistance, inReminderWindow } from './schedule';

/** Валюта в форме и карточке: «RUB, рубли». */
export const CURRENCY_NAMES: Record<Currency, string> = {
	RUB: 'RUB, рубли',
	USD: 'USD, доллары',
	EUR: 'EUR, евро',
};

/**
 * Ближайший срок платежа: дата (или `null` - прочерк), подпись и выделение окна напоминания:
 * своего окна платежа, а без него общего `reminderDaysBefore`.
 */
export function nextDueView(
	payment: Pick<
		RecurringPayment,
		'nextDueDate' | 'stoppedAt' | 'completed' | 'reminderDaysBefore'
	>,
	today: CalendarDate,
	reminderDaysBefore: number
) {
	if (payment.stoppedAt) {
		return {
			date: null,
			note: `прекращён ${formatMoment(payment.stoppedAt)}`,
			soon: false,
		};
	}

	if (payment.completed) {
		return { date: null, note: 'все оплаты сделаны', soon: false };
	}

	if (!payment.nextDueDate) {
		return { date: null, note: 'следующий период оплачен', soon: false };
	}

	return {
		date: formatDate(payment.nextDueDate),
		note: dueDistance(today, payment.nextDueDate),
		soon: inReminderWindow(
			today,
			payment.nextDueDate,
			payment.reminderDaysBefore ?? reminderDaysBefore
		),
	};
}

/** Метка просрочки по самому старому неоплаченному периоду: «просрочено 5 дн.»; `null` без просрочки. */
export function overdueLabel(
	payment: Pick<RecurringPayment, 'overdueCount' | 'oldestOverdueDays'>
) {
	return payment.overdueCount > 0 && payment.oldestOverdueDays !== null
		? `просрочено ${payment.oldestOverdueDays}\u00a0дн.`
		: null;
}

/** Срок единственного просроченного периода для текстов окон; `null`, если их нет или несколько. */
export function overdueDueDate(
	payment: Pick<RecurringPayment, 'overdueCount' | 'oldestOverdueDays'>,
	today: CalendarDate
) {
	return payment.overdueCount === 1 && payment.oldestOverdueDays !== null
		? addDays(today, -payment.oldestOverdueDays)
		: null;
}

/** Сколько оплат сделано из заданного числа: «оплачено 2 из 4»; `null` у бессрочного платежа. */
export function paymentProgress(
	payment: Pick<RecurringPayment, 'occurrenceLimit' | 'paidOccurrences'>
) {
	return payment.occurrenceLimit === null
		? null
		: `оплачено ${payment.paidOccurrences} из\u00a0${payment.occurrenceLimit}`;
}

/** Платежа нет: неизвестный id - 404, кривой - 400 проверки. Для человека это одно и то же. */
export function isPaymentMissing(error: unknown) {
	return ['not_found', 'bad_request'].includes(getApiErrorCode(error) ?? '');
}
