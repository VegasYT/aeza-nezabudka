import { describe, expect, it } from 'vitest';

import type { Period } from '@shared/api';

import {
	anchorNote,
	dueDistance,
	lastDue,
	nextDueAfter,
	nextDuesHint,
	periodLabel,
	scheduleLabel,
	shortMonthDue,
} from './schedule';

const nbsp = '\u00a0';
const nbh = '\u2011';
const monthly = (anchorDay: number) =>
	({ period: 'month', periodCount: 1, anchorDay }) as const;
const weekly = { period: 'week', periodCount: 1, anchorDay: 26 } as const;

describe('расписание регулярного платежа', () => {
	it.each([
		['2026-10-19', monthly(19), '2026-11-19'],
		['2026-12-19', monthly(19), '2027-01-19'],
		['2027-01-31', monthly(31), '2027-02-28'],
		['2028-01-31', monthly(31), '2028-02-29'],
		['2027-02-28', monthly(31), '2027-03-31'],
		['2027-01-30', monthly(30), '2027-02-28'],
		['2027-02-28', monthly(30), '2027-03-30'],
		[
			'2026-11-05',
			{ period: 'day', periodCount: 10, anchorDay: 5 },
			'2026-11-15',
		],
		[
			'2026-10-26',
			{ period: 'week', periodCount: 2, anchorDay: 26 },
			'2026-11-09',
		],
		[
			'2027-01-31',
			{ period: 'month', periodCount: 3, anchorDay: 31 },
			'2027-04-30',
		],
		[
			'2027-04-30',
			{ period: 'month', periodCount: 3, anchorDay: 31 },
			'2027-07-31',
		],
		[
			'2028-02-29',
			{ period: 'year', periodCount: 1, anchorDay: 29 },
			'2029-02-28',
		],
		[
			'2031-02-28',
			{ period: 'year', periodCount: 1, anchorDay: 29 },
			'2032-02-29',
		],
	] as const)('после %s по %j - %s', (date, schedule, expected) => {
		expect(nextDueAfter(date, schedule)).toBe(expected);
	});

	it.each([
		['2026-10-31', monthly(31), '2026-11-30'],
		['2026-12-30', monthly(30), '2027-02-28'],
		['2028-01-29', monthly(29), '2029-02-28'],
		['2026-10-19', monthly(19), null],
		['2027-01-31', { period: 'year', periodCount: 1, anchorDay: 31 }, null],
		[
			'2028-02-29',
			{ period: 'year', periodCount: 1, anchorDay: 29 },
			'2029-02-28',
		],
	] as const)(
		'сдвиг коротким месяцем после %s по %j - %s',
		(date, schedule, expected) => {
			expect(shortMonthDue(date, schedule)).toBe(expected);
		}
	);

	it.each([
		['month', 1, 'ежемесячно'],
		['month', 3, `раз в${nbsp}квартал`],
		['month', 2, `раз в${nbsp}2${nbsp}месяца`],
		['year', 1, 'ежегодно'],
		['year', 5, `раз в${nbsp}5${nbsp}лет`],
		['week', 2, `раз в${nbsp}две недели`],
		['week', 21, `раз в${nbsp}21${nbsp}неделю`],
		['day', 21, `раз в${nbsp}21${nbsp}день`],
		['day', 10, `раз в${nbsp}10${nbsp}дней`],
	] as const)(
		'периодичность %s × %i - %s',
		(period: Period, count, expected) => {
			expect(periodLabel(period, count)).toBe(expected);
		}
	);

	it.each([
		[
			{ ...monthly(19), nextDueDate: '2026-11-19' },
			`ежемесячно, 19${nbh}го${nbsp}числа`,
		],
		[
			{ ...monthly(31), nextDueDate: null },
			`ежемесячно, в${nbsp}последний день месяца`,
		],
		[
			{
				period: 'month',
				periodCount: 3,
				anchorDay: 5,
				nextDueDate: '2026-11-05',
			},
			`раз в${nbsp}квартал, 5${nbh}го${nbsp}числа`,
		],
		[
			{
				period: 'year',
				periodCount: 1,
				anchorDay: 5,
				nextDueDate: '2026-11-05',
			},
			`ежегодно, 5${nbsp}ноября`,
		],
		[
			{
				period: 'week',
				periodCount: 2,
				anchorDay: 26,
				nextDueDate: '2026-10-26',
			},
			`раз в${nbsp}две недели, по${nbsp}понедельникам`,
		],
		[
			{ period: 'year', periodCount: 1, anchorDay: 5, nextDueDate: null },
			'ежегодно',
		],
		[
			{
				period: 'day',
				periodCount: 10,
				anchorDay: 5,
				nextDueDate: '2026-11-05',
			},
			`раз в${nbsp}10${nbsp}дней`,
		],
	] as const)('расписание %j - %s', (payment, expected) => {
		expect(scheduleLabel(payment)).toBe(expected);
	});

	it('подсказка под датой называет два следующих срока', () => {
		expect(
			nextDuesHint('2027-01-31', {
				period: 'month',
				periodCount: 3,
				anchorDay: 31,
			})
		).toBe(`Следующие сроки: 30.04.2027 и${nbsp}31.07.2027`);
	});

	it.each([
		[1, null],
		[2, 'Следующий срок: 02.11.2026'],
		[4, `Следующие сроки: 02.11.2026 и${nbsp}09.11.2026`],
	])('при числе оплат %i подсказка - %s', (limit, expected) => {
		expect(nextDuesHint('2026-10-26', weekly, limit)).toBe(expected);
	});

	it.each([
		[1, '2026-10-26'],
		[4, '2026-11-16'],
	])('последняя из %i еженедельных оплат - %s', (limit, expected) => {
		expect(lastDue('2026-10-26', weekly, limit)).toBe(expected);
	});

	it('пояснение к якорю 31 называет ближайший короткий месяц', () => {
		expect(anchorNote(monthly(31), '2026-10-31')).toBe(
			`Срок повторяется 31${nbh}го${nbsp}числа, в${nbsp}коротких месяцах в${nbsp}последний день. Если выбрать 30.11, срок перейдёт на${nbsp}30${nbh}е число.`
		);
		expect(
			anchorNote(
				{ period: 'year', periodCount: 1, anchorDay: 31 },
				'2027-01-31'
			)
		).toBeNull();
	});

	it.each([
		['2026-10-24', 'сегодня'],
		['2026-10-25', 'завтра'],
		['2026-11-19', `через 26${nbsp}дней`],
	])('срок %s - %s', (due, expected) => {
		expect(dueDistance('2026-10-24', due)).toBe(expected);
	});
});
