import { describe, expect, it, vi } from 'vitest';

import {
	addDays,
	addMonths,
	daysBetween,
	endOfMonth,
	formatDate,
	startOfMonth,
} from './calendar-date';

describe('календарные даты', () => {
	it.each([
		['2026-10-19', '2026-10-24', 5],
		['2026-10-24', '2026-10-19', -5],
		['2026-09-30', '2026-10-01', 1],
		['2026-12-31', '2027-01-01', 1],
		['2028-02-28', '2028-03-01', 2],
	])('от %s до %s - %i дн.', (from, to, days) => {
		expect(daysBetween(from, to)).toBe(days);
	});

	it.each([
		['2026-10-24', -5, '2026-10-19'],
		['2026-12-31', 1, '2027-01-01'],
	])('%s плюс %i дн. - %s', (date, days, expected) => {
		expect(addDays(date, days)).toBe(expected);
	});

	it.each([
		['2026-10-24', 1, '2026-11-01'],
		['2026-11-15', -2, '2026-09-01'],
		['2026-12-31', 1, '2027-01-01'],
	])('месяц %s со сдвигом %i начинается %s', (date, months, expected) => {
		expect(addMonths(date, months)).toBe(expected);
	});

	it.each([
		['2026-10-24', '2026-10-01', '2026-10-31'],
		['2028-02-10', '2028-02-01', '2028-02-29'],
		['2026-02-10', '2026-02-01', '2026-02-28'],
	])('границы месяца %s: %s - %s', (date, start, end) => {
		expect(startOfMonth(date)).toBe(start);
		expect(endOfMonth(date)).toBe(end);
	});

	it.each(['Pacific/Kiritimati', 'America/Adak'])(
		'в часовом поясе %s даты не сдвигаются',
		(timeZone) => {
			vi.stubEnv('TZ', timeZone);

			expect(formatDate('2026-10-19')).toBe('19.10.2026');
			expect(daysBetween('2026-10-19', '2026-10-24')).toBe(5);
			expect(endOfMonth('2026-10-24')).toBe('2026-10-31');
		}
	);
});
