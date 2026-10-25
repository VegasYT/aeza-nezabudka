import { describe, expect, it } from 'vitest';

import { formatMoment, formatMomentTime, formatTimeOfDay } from './moment';

describe('моменты времени', () => {
	it.each([
		['2026-10-24T07:42:00Z', 'Europe/Moscow', '24.10.2026, 10:42'],
		['2026-10-24T22:05:00Z', 'Europe/Moscow', '25.10.2026, 01:05'],
		['2026-10-24T22:05:00Z', 'UTC', '24.10.2026, 22:05'],
	])('момент %s в поясе %s - %s', (moment, timeZone, expected) => {
		expect(formatMomentTime(moment, timeZone)).toBe(expected);
	});

	it('дата без времени по поясу, а не по UTC', () => {
		expect(formatMoment('2026-08-31T21:30:00Z', 'Europe/Moscow')).toBe(
			'01.09.2026'
		);
	});

	it('только время', () => {
		expect(formatTimeOfDay('2026-10-24T11:32:00Z', 'Europe/Moscow')).toBe(
			'14:32'
		);
	});
});
