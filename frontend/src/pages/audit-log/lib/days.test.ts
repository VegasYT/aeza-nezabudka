import { describe, expect, it } from 'vitest';

import type { AuditEntry } from '@shared/api';

import { groupByDay } from './days';

function at(moment: string): AuditEntry {
	return {
		id: moment,
		at: moment,
		actorLogin: 'a.smirnov@company.ru',
		action: 'auth.login',
		entity: 'member',
		entityId: null,
		entityName: null,
		details: {},
	};
}

// В Москве 25.10.2026 01:30: в UTC ещё 24-е.
const now = new Date('2026-10-24T22:30:00Z');

describe('записи по дням в часовом поясе браузера', () => {
	it('сегодня, вчера и старый день', () => {
		const days = groupByDay(
			[
				at('2026-10-24T21:10:00Z'),
				at('2026-10-24T20:50:00Z'),
				at('2026-10-24T07:42:00Z'),
				at('2026-10-22T08:14:00Z'),
			],
			now,
			'Europe/Moscow'
		);

		expect(
			days.map((day) => [day.title, day.entries.map((entry) => entry.at)])
		).toEqual([
			['Сегодня, 25.10.2026', ['2026-10-24T21:10:00Z']],
			['Вчера, 24.10.2026', ['2026-10-24T20:50:00Z', '2026-10-24T07:42:00Z']],
			['22.10.2026', ['2026-10-22T08:14:00Z']],
		]);
	});

	it('день считается по поясу, а не по UTC', () => {
		const [day] = groupByDay([at('2026-10-24T21:10:00Z')], now, 'UTC');

		expect(day?.title).toBe('Сегодня, 24.10.2026');
	});
});
