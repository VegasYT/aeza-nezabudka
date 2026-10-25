import { periodLabel } from '@entities/recurring-payment';
import type { AuditEntry, Currency, Department, Period } from '@shared/api';
import { ROLE_LABELS } from '@shared/auth';
import { formatDate, formatMomentTime } from '@shared/lib/dates';
import { formatMoney } from '@shared/lib/money';
import { plural, pluralWord } from '@shared/lib/plural';

import { userAgentLabel } from './user-agent';

/** Значок действия в журнале. */
export type EntryKind =
	| 'login'
	| 'logout'
	| 'paid'
	| 'unpaid'
	| 'date'
	| 'create'
	| 'edit'
	| 'stop'
	| 'remove'
	| 'member'
	| 'memberAdd'
	| 'chat'
	| 'postpone'
	| 'other';

/** Строка подробностей; `hint` - полный текст для подсказки, когда в строке он сокращён. */
export type EntryDetail = string | { text: string; hint: string };

/** Запись журнала словами: действие, объект с уточнением и что изменилось. */
export interface EntryDescription {
	kind: EntryKind;
	action: string;
	object: string | null;
	objectNote: string | null;
	details: EntryDetail[];
}

type Details = Record<string, unknown>;

const roleNames: Record<string, string> = Object.fromEntries(
	Object.entries(ROLE_LABELS).map(([role, label]) => [
		role,
		label.toLowerCase(),
	])
);

function text(value: unknown) {
	return typeof value === 'string' && value !== '' ? value : null;
}

function day(value: unknown) {
	const date = text(value);

	return date ? formatDate(date) : null;
}

const PERIODS: readonly string[] = ['day', 'week', 'month', 'year'];

// В старых записях периодичности может не быть: тогда платёж был ежемесячным.
function schedule(snapshot: Details) {
	const period = PERIODS.includes(String(snapshot.period))
		? (snapshot.period as Period)
		: 'month';
	const count =
		typeof snapshot.periodCount === 'number' ? snapshot.periodCount : 1;

	return periodLabel(period, count);
}

function money(snapshot: Details) {
	return typeof snapshot.amountMinor === 'number'
		? formatMoney(snapshot.amountMinor, snapshot.currency as Currency)
		: null;
}

function departmentOf(snapshot: Details) {
	return text(snapshot.departmentName) ?? 'без отдела';
}

function change(label: string, before: string | null, after: string | null) {
	return before === after
		? []
		: [`${label}: ${before ?? '—'} → ${after ?? '—'}`];
}

function paymentChanges(before: Details, after: Details) {
	return [
		...change('Название', text(before.name), text(after.name)),
		...change('Сумма', money(before), money(after)),
		...change(
			'Первый срок',
			day(before.scheduleFirstDueDate),
			day(after.scheduleFirstDueDate)
		),
		...change('Периодичность', schedule(before), schedule(after)),
		...change('Отдел', departmentOf(before), departmentOf(after)),
	];
}

function removedPeriods(count: unknown) {
	if (typeof count !== 'number' || count === 0) {
		return [];
	}

	const verb = pluralWord(count, 'Удалён', 'Удалено', 'Удалено');

	return [
		`${verb} ${plural(count, 'будущий период', 'будущих периода', 'будущих периодов')}`,
	];
}

function chatDepartments(ids: unknown, departments: readonly Department[]) {
	if (!Array.isArray(ids)) {
		return 'Отделы: все платежи';
	}

	const names = departments
		.filter((department) => ids.includes(department.id))
		.map((department) => department.name);

	return names.length > 0 ? `Отделы: ${names.join(', ')}` : 'Отделы: выбранные';
}

function memberChanges(details: Details) {
	const role = text(details.role);
	const lines = role
		? change(
				'Роль',
				roleNames[String(details.roleBefore)] ?? text(details.roleBefore),
				roleNames[role] ?? role
			)
		: [];

	if (
		typeof details.enabled === 'boolean' &&
		details.enabled !== details.enabledBefore
	) {
		lines.push(details.enabled ? 'Доступ включён' : 'Доступ отключён');
	}

	return lines;
}

function occurrence(
	entry: AuditEntry,
	details: Details,
	paid: boolean
): EntryDescription {
	const before = day(details.paidOnBefore);
	const after = day(details.paidOn);
	const due = day(details.dueDate);
	const via = details.source === 'telegram' ? ' через Telegram' : '';
	const target = {
		object: entry.entityName ?? text(details.paymentName),
		objectNote: due ? `срок ${due}` : null,
	};

	if (!paid) {
		return {
			...target,
			kind: 'unpaid',
			action: `Отмена оплаты${via}`,
			details: before ? [`Была дата оплаты ${before}`] : [],
		};
	}

	return before && after
		? {
				...target,
				kind: 'date',
				action: `Исправление даты оплаты${via}`,
				details: [`Дата оплаты ${before} → ${after}`],
			}
		: {
				...target,
				kind: 'paid',
				action: `Отметка оплаты${via}`,
				details: after ? [`Дата оплаты ${after}`] : [],
			};
}

// В старых записях о входе адреса и браузера нет.
function client(details: Details): EntryDetail[] {
	const ip = text(details.ip);
	const agent = text(details.userAgent);
	const browser = agent ? userAgentLabel(agent) : null;
	const line = [ip && `IP ${ip}`, browser].filter(Boolean).join(', ');

	if (!line) {
		return [];
	}

	return agent && browser !== agent ? [{ text: line, hint: agent }] : [line];
}

function chat(
	entry: AuditEntry,
	action: string,
	details: string[]
): EntryDescription {
	return {
		kind: 'chat',
		action,
		object: entry.entityName ? `«${entry.entityName}»` : null,
		objectNote: 'групповой чат Telegram',
		details,
	};
}

/** Описание записи журнала для таблицы и карточек; `departments` - чтобы назвать отделы чата. */
export function describeEntry(
	entry: AuditEntry,
	departments: readonly Department[] = []
): EntryDescription {
	const details = entry.details as Details;
	const name = entry.entityName;
	const base = { object: name, objectNote: null, details: [] };

	switch (entry.action) {
		case 'auth.login':
			return {
				...base,
				kind: 'login',
				action: 'Вход',
				object: null,
				details: client(details),
			};

		case 'auth.logout':
			return { ...base, kind: 'logout', action: 'Выход', object: null };

		case 'occurrence.paid':
			return occurrence(entry, details, true);

		case 'occurrence.unpaid':
			return occurrence(entry, details, false);

		case 'payment.created': {
			const department = text(details.departmentName);

			return {
				kind: 'create',
				action: 'Создание платежа',
				object: name,
				objectNote: 'регулярный платёж',
				details: [
					[money(details), schedule(details)].filter(Boolean).join(', '),
					...(department ? [`Отдел: ${department}`] : []),
				],
			};
		}

		case 'payment.updated':
			return {
				kind: 'edit',
				action: 'Изменение платежа',
				object: name,
				objectNote: 'регулярный платёж',
				details: paymentChanges(
					(details.before ?? {}) as Details,
					(details.after ?? {}) as Details
				),
			};

		case 'payment.stopped':
			return {
				kind: 'stop',
				action: 'Прекращение платежа',
				object: name,
				objectNote: 'регулярный платёж',
				details: removedPeriods(details.removedPeriods),
			};

		case 'member.created':
			return {
				...base,
				kind: 'memberAdd',
				action: 'Добавление участника',
				details: text(details.role)
					? [`Роль: ${roleNames[String(details.role)] ?? details.role}`]
					: [],
			};

		case 'member.updated':
			return {
				...base,
				kind: 'member',
				action: 'Изменение участника',
				details: memberChanges(details),
			};

		case 'member.deleted':
			return { ...base, kind: 'remove', action: 'Удаление участника' };

		case 'department.created':
			return { ...base, kind: 'create', action: 'Создание отдела' };

		case 'department.renamed':
			return {
				...base,
				kind: 'edit',
				action: 'Переименование отдела',
				details: change(
					'Название',
					text(details.nameBefore),
					text(details.name) ?? name
				),
			};

		case 'department.deleted':
			return { ...base, kind: 'remove', action: 'Удаление отдела' };

		case 'reminder.postponed': {
			const until = text(details.until);

			return {
				kind: 'postpone',
				action: 'Напоминание отложено на\u00a0завтра',
				object: name,
				objectNote: null,
				details: [
					...(details.source === 'telegram' ? ['Через Telegram'] : []),
					...(until ? [`Напомнит снова ${formatMomentTime(until)}`] : []),
				],
			};
		}

		case 'telegram_chat.linked':
			return chat(entry, 'Подключение чата', []);

		case 'telegram_chat.updated':
			return chat(entry, 'Изменение чата', [
				chatDepartments(details.departmentIds, departments),
			]);

		case 'telegram_chat.deleted':
			return chat(entry, 'Отключение чата', []);

		default:
			return { ...base, kind: 'other', action: entry.action };
	}
}
