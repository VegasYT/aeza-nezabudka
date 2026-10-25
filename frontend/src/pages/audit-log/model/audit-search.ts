import { addDays, type CalendarDate } from '@shared/lib/dates';

/** Группы действий фильтра: ключ в адресе, подпись и префикс `action` для API. */
export const ACTION_GROUPS = [
	{ value: 'auth', label: 'Вход и выход', action: 'auth.*' },
	{ value: 'occurrences', label: 'Оплаты', action: 'occurrence.*' },
	{ value: 'reminders', label: 'Напоминания', action: 'reminder.*' },
	{ value: 'payments', label: 'Платежи', action: 'payment.*' },
	{ value: 'members', label: 'Участники', action: 'member.*' },
	{ value: 'departments', label: 'Отделы', action: 'department.*' },
	{ value: 'chats', label: 'Чаты Telegram', action: 'telegram_chat.*' },
] as const;

export type ActionGroup = (typeof ACTION_GROUPS)[number]['value'];

/** Фильтры журнала в адресе; значения по умолчанию в адрес не пишутся. */
export interface AuditSearch {
	action?: ActionGroup;
	/** Email автора записей. */
	actor?: string;
	from?: CalendarDate;
	to?: CalendarDate;
}

/** Сколько дней журнала видно по умолчанию, включая сегодня. */
export const DEFAULT_DAYS = 30;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function date(value: unknown) {
	return typeof value === 'string' && DATE.test(value) ? value : undefined;
}

/** Разбирает адрес: неизвестные и битые значения отбрасываются. */
export function validateAuditSearch(raw: Record<string, unknown>): AuditSearch {
	const group = ACTION_GROUPS.find(({ value }) => value === raw.action);

	return {
		action: group?.value,
		actor:
			typeof raw.actor === 'string' && raw.actor.includes('@')
				? raw.actor
				: undefined,
		from: date(raw.from),
		to: date(raw.to),
	};
}

/** Период журнала: из адреса или последние 30 дней по сегодня браузера. */
export function auditPeriod(search: AuditSearch, today: CalendarDate) {
	return {
		from: search.from ?? addDays(today, 1 - DEFAULT_DAYS),
		to: search.to ?? today,
	};
}

function parts(day: CalendarDate) {
	return day.split('-').map(Number) as [number, number, number];
}

/** Начало дня в часовом поясе браузера как момент API. */
export function dayStart(day: CalendarDate) {
	const [year, month, date] = parts(day);

	return new Date(year, month - 1, date).toISOString();
}

/** Последний миг дня в часовом поясе браузера как момент API. */
export function dayEnd(day: CalendarDate) {
	const [year, month, date] = parts(day);

	return new Date(
		new Date(year, month - 1, date + 1).getTime() - 1
	).toISOString();
}
