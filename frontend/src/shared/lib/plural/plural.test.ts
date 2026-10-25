import { describe, expect, it } from 'vitest';

import { formatDays } from './plural';

const nbsp = '\u00a0';

describe('склонение после числа', () => {
	it.each([
		[1, 'день'],
		[2, 'дня'],
		[5, 'дней'],
		[11, 'дней'],
		[21, 'день'],
		[26, 'дней'],
	])('%i %s', (days, word) => {
		expect(formatDays(days)).toBe(`${days}${nbsp}${word}`);
	});
});
