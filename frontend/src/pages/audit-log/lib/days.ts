import type { AuditEntry } from '@shared/api';
import { addDays, type CalendarDate, formatDate } from '@shared/lib/dates';

/** Календарный день момента в часовом поясе браузера (`timeZone` задают тесты). */
export function localDay(
	moment: Date | string,
	timeZone?: string
): CalendarDate {
	return dayFormatter(timeZone).format(new Date(moment));
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

// Записи журнала группируются по дням сотнями: форматтер на пояс создаётся один раз.
function dayFormatter(timeZone: string | undefined) {
	let cached = dayFormatters.get(timeZone ?? '');

	if (!cached) {
		// en-CA пишет дату как YYYY-MM-DD.
		cached = new Intl.DateTimeFormat('en-CA', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			timeZone,
		});
		dayFormatters.set(timeZone ?? '', cached);
	}

	return cached;
}

/** Записи одного дня с заголовком «Сегодня, 25.10.2026», «Вчера, 24.10.2026» или датой. */
export interface EntryDay {
	day: CalendarDate;
	title: string;
	entries: AuditEntry[];
}

/** Группирует записи по дням, сохраняя порядок сервера (новые сверху). */
export function groupByDay(
	entries: readonly AuditEntry[],
	now: Date,
	timeZone?: string
): EntryDay[] {
	const today = localDay(now, timeZone);
	const yesterday = addDays(today, -1);
	const days: EntryDay[] = [];

	for (const entry of entries) {
		const day = localDay(entry.at, timeZone);
		const last = days.at(-1);

		if (last?.day === day) {
			last.entries.push(entry);
			continue;
		}

		const prefix =
			day === today ? 'Сегодня, ' : day === yesterday ? 'Вчера, ' : '';

		days.push({ day, title: `${prefix}${formatDate(day)}`, entries: [entry] });
	}

	return days;
}
