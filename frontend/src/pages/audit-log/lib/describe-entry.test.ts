import { describe, expect, it } from 'vitest';

import type { AuditEntry } from '@shared/api';
import { formatMomentTime } from '@shared/lib/dates';

import { describeEntry } from './describe-entry';

// Сравниваем строки с обычными пробелами: неразрывные в ожиданиях не видны.
const plain = (value: unknown) =>
	JSON.parse(JSON.stringify(value).replaceAll('\u00a0', ' '));

function entry(
	action: string,
	details: Record<string, unknown> = {},
	entityName: string | null = 'Интернет в офисе'
): AuditEntry {
	return {
		id: 'e-1',
		at: '2026-10-24T07:42:00Z',
		actorLogin: 'a.smirnov@company.ru',
		action,
		entity: action.split('.')[0] ?? action,
		entityId: 'x-1',
		entityName,
		details,
	};
}

const snapshot = {
	name: 'Интернет в офисе',
	amountMinor: 490_000,
	currency: 'RUB',
	scheduleFirstDueDate: '2026-10-20',
	period: 'month',
	periodCount: 1,
	departmentId: 'd-office',
	departmentName: 'Офис',
};
const chrome =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const departments = [
	{ id: 'd-it', name: 'ИТ', paymentsCount: 1 },
	{ id: 'd-office', name: 'Офис', paymentsCount: 2 },
];

describe('запись журнала словами', () => {
	it.each([
		[
			'вход',
			entry('auth.login', {}, 'a.smirnov@company.ru'),
			{
				kind: 'login',
				action: 'Вход',
				object: null,
				objectNote: null,
				details: [],
			},
		],
		[
			'вход с адресом и браузером',
			entry(
				'auth.login',
				{ ip: '10.0.0.7', userAgent: chrome },
				'a.smirnov@company.ru'
			),
			{
				kind: 'login',
				action: 'Вход',
				object: null,
				objectNote: null,
				details: [{ text: 'IP 10.0.0.7, Chrome 130 на Windows', hint: chrome }],
			},
		],
		[
			'вход скриптом',
			entry(
				'auth.login',
				{ ip: '10.0.0.7', userAgent: 'curl/8.4.0' },
				'a.smirnov@company.ru'
			),
			{
				kind: 'login',
				action: 'Вход',
				object: null,
				objectNote: null,
				details: ['IP 10.0.0.7, curl/8.4.0'],
			},
		],
		[
			'отметка оплаты',
			entry('occurrence.paid', {
				dueDate: '2026-10-20',
				paidOnBefore: null,
				paidOn: '2026-10-22',
			}),
			{
				kind: 'paid',
				action: 'Отметка оплаты',
				object: 'Интернет в офисе',
				objectNote: 'срок 20.10.2026',
				details: ['Дата оплаты 22.10.2026'],
			},
		],
		[
			'исправление даты',
			entry('occurrence.paid', {
				dueDate: '2026-09-20',
				paidOnBefore: '2026-09-20',
				paidOn: '2026-09-18',
			}),
			{
				kind: 'date',
				action: 'Исправление даты оплаты',
				object: 'Интернет в офисе',
				objectNote: 'срок 20.09.2026',
				details: ['Дата оплаты 20.09.2026 → 18.09.2026'],
			},
		],
		[
			'отметка оплаты из Telegram',
			entry('occurrence.paid', {
				source: 'telegram',
				dueDate: '2026-10-20',
				paidOnBefore: null,
				paidOn: '2026-10-22',
			}),
			{
				kind: 'paid',
				action: 'Отметка оплаты через Telegram',
				object: 'Интернет в офисе',
				objectNote: 'срок 20.10.2026',
				details: ['Дата оплаты 22.10.2026'],
			},
		],
		[
			'напоминание отложено',
			entry(
				'reminder.postponed',
				{ source: 'telegram', until: '2026-10-26T07:00:00Z' },
				'Аренда офиса'
			),
			{
				kind: 'postpone',
				action: 'Напоминание отложено на завтра',
				object: 'Аренда офиса',
				objectNote: null,
				details: [
					'Через Telegram',
					`Напомнит снова ${formatMomentTime('2026-10-26T07:00:00Z')}`,
				],
			},
		],
		[
			'отмена оплаты',
			entry('occurrence.unpaid', {
				dueDate: '2026-10-20',
				paidOnBefore: '2026-10-22',
				paidOn: null,
			}),
			{
				kind: 'unpaid',
				action: 'Отмена оплаты',
				object: 'Интернет в офисе',
				objectNote: 'срок 20.10.2026',
				details: ['Была дата оплаты 22.10.2026'],
			},
		],
		[
			'изменение платежа',
			entry('payment.updated', {
				before: snapshot,
				after: {
					...snapshot,
					amountMinor: 590_000,
					period: 'month',
					periodCount: 3,
					departmentId: null,
					departmentName: null,
				},
			}),
			{
				kind: 'edit',
				action: 'Изменение платежа',
				object: 'Интернет в офисе',
				objectNote: 'регулярный платёж',
				details: [
					'Сумма: 4 900,00 ₽ → 5 900,00 ₽',
					'Периодичность: ежемесячно → раз в квартал',
					'Отдел: Офис → без отдела',
				],
			},
		],
		[
			'создание платежа',
			entry('payment.created', snapshot),
			{
				kind: 'create',
				action: 'Создание платежа',
				object: 'Интернет в офисе',
				objectNote: 'регулярный платёж',
				details: ['4 900,00 ₽, ежемесячно', 'Отдел: Офис'],
			},
		],
		[
			'прекращение с одним периодом',
			entry('payment.stopped', { removedPeriods: 1 }, 'Облачное хранилище'),
			{
				kind: 'stop',
				action: 'Прекращение платежа',
				object: 'Облачное хранилище',
				objectNote: 'регулярный платёж',
				details: ['Удалён 1 будущий период'],
			},
		],
		[
			'новый участник',
			entry(
				'member.created',
				{ email: 'erp@company.ru', role: 'integration' },
				'erp@company.ru'
			),
			{
				kind: 'memberAdd',
				action: 'Добавление участника',
				object: 'erp@company.ru',
				objectNote: null,
				details: ['Роль: интеграция'],
			},
		],
		[
			'роль и доступ участника',
			entry(
				'member.updated',
				{
					email: 'buh.petrova@company.ru',
					roleBefore: 'user',
					enabledBefore: true,
					role: 'integration',
					enabled: false,
				},
				'buh.petrova@company.ru'
			),
			{
				kind: 'member',
				action: 'Изменение участника',
				object: 'buh.petrova@company.ru',
				objectNote: null,
				details: ['Роль: пользователь → интеграция', 'Доступ отключён'],
			},
		],
		[
			'переименование отдела',
			entry(
				'department.renamed',
				{ nameBefore: 'ИТ', name: 'Инфраструктура' },
				'Инфраструктура'
			),
			{
				kind: 'edit',
				action: 'Переименование отдела',
				object: 'Инфраструктура',
				objectNote: null,
				details: ['Название: ИТ → Инфраструктура'],
			},
		],
		[
			'отделы чата',
			entry(
				'telegram_chat.updated',
				{ departmentIds: ['d-office', 'd-it'] },
				'Бухгалтерия'
			),
			{
				kind: 'chat',
				action: 'Изменение чата',
				object: '«Бухгалтерия»',
				objectNote: 'групповой чат Telegram',
				details: ['Отделы: ИТ, Офис'],
			},
		],
		[
			'чат на все платежи',
			entry('telegram_chat.updated', { departmentIds: null }, 'Бухгалтерия'),
			{
				kind: 'chat',
				action: 'Изменение чата',
				object: '«Бухгалтерия»',
				objectNote: 'групповой чат Telegram',
				details: ['Отделы: все платежи'],
			},
		],
		[
			'неизвестное действие',
			entry('payment.archived', {}, 'Аренда'),
			{
				kind: 'other',
				action: 'payment.archived',
				object: 'Аренда',
				objectNote: null,
				details: [],
			},
		],
	])('%s', (_, value, expected) => {
		expect(plain(describeEntry(value, departments))).toEqual(expected);
	});

	it.each([
		[3, 'Удалено 3 будущих периода'],
		[5, 'Удалено 5 будущих периодов'],
		[21, 'Удалён 21 будущий период'],
	])('прекращение: %i - «%s»', (count, expected) => {
		expect(
			plain(
				describeEntry(entry('payment.stopped', { removedPeriods: count }))
					.details
			)
		).toEqual([expected]);
	});

	it('прекращение без будущих периодов - без подробностей', () => {
		expect(
			describeEntry(entry('payment.stopped', { removedPeriods: 0 })).details
		).toEqual([]);
	});
});

describe('окно напоминаний', () => {
	const settings = (
		before: number,
		after: number,
		fromServerSettings = false
	) =>
		entry(
			'settings.updated',
			{
				before: { reminderDaysBefore: before },
				after: { reminderDaysBefore: after, fromServerSettings },
			},
			'Окно напоминаний'
		);

	it('изменение общего окна', () => {
		expect(plain(describeEntry(settings(3, 5)))).toEqual({
			kind: 'edit',
			action: 'Изменение настроек',
			object: 'Окно напоминаний',
			objectNote: 'для всех платежей',
			details: ['Напоминание: за 3 дня → за 5 дней'],
		});
	});

	it('возврат к значению сервера', () => {
		expect(plain(describeEntry(settings(5, 0, true)).details)).toEqual([
			'Напоминание: за 5 дней → в день срока',
			'Как на сервере',
		]);
	});

	it('своё окно у нового платежа', () => {
		expect(
			plain(
				describeEntry(
					entry('payment.created', { ...snapshot, reminderDaysBefore: 7 })
				).details
			)
		).toContain('Напоминание: за 7 дней');
	});

	it.each([
		[7, null, 'Напоминание: за 7 дней → как у всех'],
		[undefined, 5, 'Напоминание: как у всех → за 5 дней'],
	])('изменение окна платежа: %s → %s', (before, after, expected) => {
		expect(
			plain(
				describeEntry(
					entry('payment.updated', {
						before: { ...snapshot, reminderDaysBefore: before },
						after: { ...snapshot, reminderDaysBefore: after },
					})
				).details
			)
		).toEqual([expected]);
	});
});

describe('чеки', () => {
	it('чек из Telegram', () => {
		expect(
			plain(
				describeEntry(
					entry('receipt.attached', {
						fileName: 'check.pdf',
						contentType: 'application/pdf',
						size: 250_000,
						replaced: false,
						source: 'telegram',
					})
				)
			)
		).toEqual({
			kind: 'receipt',
			action: 'Загрузка чека через Telegram',
			object: 'Интернет в офисе',
			objectNote: 'чек оплаты',
			details: ['check.pdf, 244 КБ'],
		});
	});

	it('замена и удаление', () => {
		expect(
			describeEntry(
				entry('receipt.attached', {
					fileName: 'new.png',
					size: 1000,
					replaced: true,
				})
			).action
		).toBe('Замена чека');
		expect(
			plain(describeEntry(entry('receipt.deleted', { fileName: 'check.pdf' })))
		).toMatchObject({ action: 'Удаление чека', details: ['check.pdf'] });
	});
});
