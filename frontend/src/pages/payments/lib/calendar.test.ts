import { describe, expect, it } from 'vitest';

import type { PlannedOccurrence } from '@shared/api';

import { calendarMonths, monthWeeks, plannedAppearsOn } from './calendar';

const today = '2026-10-24';

describe('месяцы календаря', () => {
	it.each([
		[
			'октябрь и ноябрь',
			{ kind: 'months', from: '2026-10-01', to: '2026-11-30' } as const,
			['2026-10-01', '2026-11-01'],
		],
		[
			'на дату - с текущего месяца',
			{ kind: 'date', to: '2026-12-15' } as const,
			['2026-10-01', '2026-11-01', '2026-12-01'],
		],
		[
			'период без конца - один месяц',
			{ kind: 'range', from: '2026-11-16' } as const,
			['2026-11-01'],
		],
		[
			'на прошедшую дату - текущий месяц',
			{ kind: 'date', to: '2026-09-30' } as const,
			['2026-10-01'],
		],
	])('%s', (_, period, expected) => {
		expect(calendarMonths(period, today)).toEqual(expected);
	});

	it('не больше 12 месяцев', () => {
		expect(
			calendarMonths(
				{ kind: 'months', from: '2026-01-01', to: '2027-12-31' },
				today
			)
		).toHaveLength(12);
	});
});

describe('недели месяца с понедельника', () => {
	it('ноябрь 2026 начинается с воскресенья', () => {
		const weeks = monthWeeks('2026-11-01');

		expect(weeks[0]).toEqual([
			null,
			null,
			null,
			null,
			null,
			null,
			'2026-11-01',
		]);
		expect(weeks.at(-1)?.[0]).toBe('2026-11-30');
		expect(weeks).toHaveLength(6);
	});
});

describe('когда появится плановый период', () => {
	const planned = (dueDate: string): PlannedOccurrence => ({
		recurringPayment: { id: 'p-server', name: 'Сервер', stopped: false },
		department: null,
		dueDate,
		amountMinor: 2500,
		currency: 'USD',
	});
	const known = [
		{ recurringPayment: { id: 'p-server' }, dueDate: '2026-10-26' },
		{ recurringPayment: { id: 'p-rent' }, dueDate: '2026-11-19' },
		{ recurringPayment: { id: 'p-server' }, dueDate: '2026-11-26' },
	];

	it('в день срока предыдущего периода того же платежа', () => {
		expect(plannedAppearsOn(planned('2026-11-26'), known)).toBe('2026-10-26');
		expect(plannedAppearsOn(planned('2026-12-26'), known)).toBe('2026-11-26');
	});

	it('без предыдущего периода - неизвестно', () => {
		expect(plannedAppearsOn(planned('2026-10-01'), known)).toBeNull();
	});
});
