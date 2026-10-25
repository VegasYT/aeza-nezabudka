import { describe, expect, it } from 'vitest';

import { activityLabel } from './format';

describe('активность участника', () => {
	it('активность - дата и время момента', () => {
		expect(
			activityLabel(
				{ role: 'user', lastSeenAt: '2026-10-24T07:42:00Z' },
				'Europe/Moscow'
			)
		).toBe('24.10.2026, 10:42');
	});

	it.each([
		['user', 'Входа ещё не\u00a0было'],
		['admin', 'Входа ещё не\u00a0было'],
		['integration', 'Запросов ещё не\u00a0было'],
	] as const)('без активности роль %s - «%s»', (role, expected) => {
		expect(activityLabel({ role, lastSeenAt: null })).toBe(expected);
	});
});
