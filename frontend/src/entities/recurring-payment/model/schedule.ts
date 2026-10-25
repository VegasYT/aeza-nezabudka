import type { Period, RecurringPayment } from '@shared/api';
import {
	addDays,
	addMonths,
	type CalendarDate,
	daysBetween,
	endOfMonth,
	formatDate,
} from '@shared/lib/dates';
import { formatDays, pluralWord } from '@shared/lib/plural';

/** Расписание платежа: каждые `periodCount` единиц `period`, у месяца и года - от якорного дня. */
export type Schedule = Pick<
	RecurringPayment,
	'period' | 'periodCount' | 'anchorDay'
>;

const N = '\u00a0';
// Неразрывный дефис: «19-го» не переносится по дефису на узком экране.
const H = '\u2011';

/** Единица в винительном падеже после «раз в N»: «раз в 21 день», «раз в 2 недели», «раз в 5 лет». */
const PERIOD_WORDS: Record<Period, [string, string, string]> = {
	day: ['день', 'дня', 'дней'],
	week: ['неделю', 'недели', 'недель'],
	month: ['месяц', 'месяца', 'месяцев'],
	year: ['год', 'года', 'лет'],
};

const NAMED: Record<string, string> = {
	'day:1': 'ежедневно',
	'week:1': 'еженедельно',
	'week:2': `раз в${N}две недели`,
	'month:1': 'ежемесячно',
	'month:3': `раз в${N}квартал`,
	'month:6': `раз в${N}полгода`,
	'year:1': 'ежегодно',
};

const MONTHS = [
	'января',
	'февраля',
	'марта',
	'апреля',
	'мая',
	'июня',
	'июля',
	'августа',
	'сентября',
	'октября',
	'ноября',
	'декабря',
];

const WEEKDAYS = [
	'воскресеньям',
	'понедельникам',
	'вторникам',
	'средам',
	'четвергам',
	'пятницам',
	'субботам',
];

/** Число месяца в дате `YYYY-MM-DD`. */
export function dayOf(date: CalendarDate) {
	return Number(date.slice(8, 10));
}

/** Единица периода в форме для числа: «дней», «недели», «месяц». */
export function periodWord(period: Period, count: number) {
	return pluralWord(count, ...PERIOD_WORDS[period]);
}

/** Периодичность словами: «ежемесячно», «раз в квартал», «раз в 10 дней». */
export function periodLabel(period: Period, count: number) {
	return (
		NAMED[`${period}:${count}`] ??
		`раз в${N}${count}${N}${periodWord(period, count)}`
	);
}

/** Срок следующего периода; у месяца и года - якорный день или последний день короткого месяца. */
export function nextDueAfter(
	date: CalendarDate,
	{ period, periodCount, anchorDay }: Schedule
): CalendarDate {
	if (period === 'day' || period === 'week') {
		return addDays(date, periodCount * (period === 'week' ? 7 : 1));
	}

	const months = periodCount * (period === 'year' ? 12 : 1);
	const monthEnd = endOfMonth(addMonths(date, months));

	return `${monthEnd.slice(0, 8)}${String(Math.min(anchorDay, dayOf(monthEnd))).padStart(2, '0')}`;
}

/** Расписание в строке списка: «ежемесячно, 19-го числа», «ежегодно, 5 ноября», «раз в две недели, по понедельникам». */
export function scheduleLabel(
	payment: Schedule & Pick<RecurringPayment, 'nextDueDate'>
) {
	const { period, periodCount, anchorDay, nextDueDate } = payment;
	const label = periodLabel(period, periodCount);

	if (period === 'month') {
		return anchorDay === 31
			? `${label}, в${N}последний день месяца`
			: `${label}, ${anchorDay}${H}го${N}числа`;
	}

	if (!nextDueDate) {
		return label;
	}

	if (period === 'year') {
		return `${label}, ${anchorDay}${N}${MONTHS[Number(nextDueDate.slice(5, 7)) - 1]}`;
	}

	if (period === 'week') {
		const weekday = new Date(`${nextDueDate}T00:00:00Z`).getUTCDay();

		return `${label}, по${N}${WEEKDAYS[weekday]}`;
	}

	return label;
}

/** Подпись под датой ближайшей оплаты: следующие сроки по расписанию, не больше, чем позволяет число оплат. */
export function nextDuesHint(
	date: CalendarDate,
	schedule: Schedule,
	limit: number | null = null
) {
	const second = nextDueAfter(date, schedule);
	const third = nextDueAfter(second, schedule);

	if (limit === 1) {
		return null;
	}

	return limit === 2
		? `Следующий срок: ${formatDate(second)}`
		: `Следующие сроки: ${formatDate(second)} и${N}${formatDate(third)}`;
}

/** Срок последней из `limit` оплат, если первая - `date`. */
export function lastDue(date: CalendarDate, schedule: Schedule, limit: number) {
	let due = date;

	for (let paid = 1; paid < limit; paid += 1) {
		due = nextDueAfter(due, schedule);
	}

	return due;
}

/** Первый срок после `date`, который короткий месяц сдвинул раньше якорного дня; `null`, если сдвигов нет. */
export function shortMonthDue(
	date: CalendarDate,
	schedule: Schedule
): CalendarDate | null {
	if (schedule.period === 'day' || schedule.period === 'week') {
		return null;
	}

	let due = date;

	// Сдвиг якоря 29-31 встречается не реже раза в восемь лет (29 февраля), с запасом на високосный год.
	for (let step = 0; step < 24; step += 1) {
		due = nextDueAfter(due, schedule);

		if (dayOf(due) < schedule.anchorDay) {
			return due;
		}
	}

	return null;
}

/** Пояснение к якорю 29-31 в форме изменения; `null`, если короткие месяцы срок не сдвигают. */
export function anchorNote(
	schedule: Schedule,
	nextDueDate: CalendarDate | null
) {
	if (schedule.anchorDay < 29 || !nextDueDate) {
		return null;
	}

	const short = shortMonthDue(nextDueDate, schedule);

	if (!short) {
		return null;
	}

	return `Срок повторяется ${schedule.anchorDay}${H}го${N}числа, в${N}коротких месяцах в${N}последний день. Если выбрать ${formatDate(short).slice(0, 5)}, срок перейдёт на${N}${dayOf(short)}${H}е число.`;
}

/** Срок относительно сегодня: «сегодня», «завтра», «через 26 дней». */
export function dueDistance(today: CalendarDate, due: CalendarDate) {
	const days = daysBetween(today, due);

	if (days <= 0) {
		return 'сегодня';
	}

	return days === 1 ? 'завтра' : `через ${formatDays(days)}`;
}

/** Срок попадает в окно напоминания: напоминание уйдёт сразу после сохранения. */
export function inReminderWindow(
	today: CalendarDate,
	due: CalendarDate,
	reminderDaysBefore: number
) {
	const days = daysBetween(today, due);

	return days >= 0 && days <= reminderDaysBefore;
}
