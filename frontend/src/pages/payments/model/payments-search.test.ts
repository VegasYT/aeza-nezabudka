import { describe, expect, it } from 'vitest';

import {
	beforePeriodLabel,
	defaultPeriod,
	type Period,
	periodLabel,
	periodPhrase,
	periodSearch,
	resolvePeriod,
	shiftPeriod,
	validatePaymentsSearch,
} from './payments-search';

const today = '2026-10-24';
const nbsp = '\u00a0';

describe('адрес страницы «Платежи»', () => {
	it('вид и год бюджета', () => {
		expect(
			validatePaymentsSearch({ view: 'budget', year: '2027' })
		).toMatchObject({
			view: 'budget',
			year: 2027,
		});
		expect(
			validatePaymentsSearch({ view: 'table', year: 'abc' })
		).toMatchObject({
			view: undefined,
			year: undefined,
		});
	});

	it('отбрасывает неизвестные и битые значения', () => {
		expect(
			validatePaymentsSearch({
				from: '2026-13',
				to: '2026-11-30',
				dept: '',
				status: 'late',
				currency: 'GBP',
				order: 'asc',
				page: '1',
				extra: 'x',
			})
		).toEqual({
			from: undefined,
			to: '2026-11-30',
			dept: undefined,
			status: undefined,
			currency: undefined,
			order: undefined,
			page: undefined,
		});
	});

	it('принимает корректные значения', () => {
		expect(
			validatePaymentsSearch({
				from: '2026-09-01',
				to: '2026-11-30',
				dept: 'none',
				status: 'overdue',
				currency: 'EUR',
				order: 'desc',
				page: 2,
			})
		).toEqual({
			from: '2026-09-01',
			to: '2026-11-30',
			dept: 'none',
			status: 'overdue',
			currency: 'EUR',
			order: 'desc',
			page: 2,
		});
	});

	it.each<[string, { from?: string; to?: string }, Period]>([
		[
			'без дат - этот и следующий месяц',
			{},
			{ kind: 'months', from: '2026-10-01', to: '2026-11-30' },
		],
		[
			'только to - на дату',
			{ to: '2026-11-30' },
			{ kind: 'date', to: '2026-11-30' },
		],
		[
			'границы месяцев - месяцы',
			{ from: '2026-09-01', to: '2026-11-30' },
			{ kind: 'months', from: '2026-09-01', to: '2026-11-30' },
		],
		[
			'иначе - свой период',
			{ from: '2026-10-16', to: '2026-11-15' },
			{ kind: 'range', from: '2026-10-16', to: '2026-11-15' },
		],
	])('%s', (_, search, period) => {
		expect(resolvePeriod(search, today)).toEqual(period);
	});

	it('период по умолчанию в адрес не пишется', () => {
		expect(periodSearch(defaultPeriod(today), today)).toEqual({
			from: undefined,
			to: undefined,
		});
		expect(periodSearch({ kind: 'date', to: '2026-11-30' }, today)).toEqual({
			from: undefined,
			to: '2026-11-30',
		});
	});

	it('стрелки сдвигают месяцы, сохраняя их число', () => {
		expect(shiftPeriod(defaultPeriod(today), -1)).toEqual({
			kind: 'months',
			from: '2026-09-01',
			to: '2026-10-31',
		});
	});

	it.each<[Period, string]>([
		[{ kind: 'months', from: '2026-10-01', to: '2026-10-31' }, 'Октябрь 2026'],
		[
			{ kind: 'months', from: '2026-10-01', to: '2026-11-30' },
			`Октябрь и${nbsp}ноябрь 2026`,
		],
		[
			{ kind: 'months', from: '2026-09-01', to: '2026-11-30' },
			`С${nbsp}сентября по${nbsp}ноябрь 2026`,
		],
		[
			{ kind: 'months', from: '2026-12-01', to: '2027-01-31' },
			`С${nbsp}декабря 2026 по${nbsp}январь 2027`,
		],
		[{ kind: 'date', to: '2026-11-30' }, `По${nbsp}30.11.2026`],
		[
			{ kind: 'range', from: '2026-10-16', to: '2026-11-15' },
			`С${nbsp}16.10.2026 по${nbsp}15.11.2026`,
		],
	])('подпись %j - %s', (period, label) => {
		expect(periodLabel(period)).toBe(label);
	});

	it.each<[Period, string]>([
		[
			{ kind: 'months', from: '2026-10-01', to: '2026-10-31' },
			`за${nbsp}октябрь`,
		],
		[
			{ kind: 'months', from: '2026-10-01', to: '2026-11-30' },
			`за${nbsp}октябрь и${nbsp}ноябрь`,
		],
		[{ kind: 'date', to: '2026-11-30' }, `по${nbsp}30.11.2026`],
	])('фраза %j - %s', (period, phrase) => {
		expect(periodPhrase(period)).toBe(phrase);
	});

	it('начало периода для строки о прошлой просрочке', () => {
		expect(beforePeriodLabel(defaultPeriod(today))).toBe('раньше октября');
		expect(beforePeriodLabel({ kind: 'date', to: '2026-11-30' })).toBeNull();
	});
});
