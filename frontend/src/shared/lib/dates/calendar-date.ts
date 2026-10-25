/**
 * Календарная дата API - строка `YYYY-MM-DD` без времени и часового пояса (ADR-006).
 * Арифметика идёт через полночь UTC, поэтому результат не зависит от часового пояса браузера.
 */
export type CalendarDate = string;

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(date: CalendarDate) {
	return {
		year: Number(date.slice(0, 4)),
		month: Number(date.slice(5, 7)),
		day: Number(date.slice(8, 10)),
	};
}

function toUtc(date: CalendarDate) {
	const { year, month, day } = parts(date);

	return Date.UTC(year, month - 1, day);
}

function fromUtc(time: number): CalendarDate {
	return new Date(time).toISOString().slice(0, 10);
}

/** «19.10.2026». */
export function formatDate(date: CalendarDate) {
	return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

/** Сколько дней от `from` до `to`; отрицательное, если `to` раньше. */
export function daysBetween(from: CalendarDate, to: CalendarDate) {
	return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Дата через `days` дней (отрицательное - раньше). */
export function addDays(date: CalendarDate, days: number) {
	return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Первое число месяца даты. */
export function startOfMonth(date: CalendarDate) {
	return `${date.slice(0, 7)}-01`;
}

/** Последнее число месяца даты. */
export function endOfMonth(date: CalendarDate) {
	const { year, month } = parts(date);

	return fromUtc(Date.UTC(year, month, 0));
}

/** Первое число месяца, сдвинутого на `months` от месяца даты. */
export function addMonths(date: CalendarDate, months: number) {
	const { year, month } = parts(date);

	return fromUtc(Date.UTC(year, month - 1 + months, 1));
}
