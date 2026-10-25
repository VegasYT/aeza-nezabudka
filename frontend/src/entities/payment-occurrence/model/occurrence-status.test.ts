import { describe, expect, it } from 'vitest';

import { occurrenceStatus } from './occurrence-status';

const today = '2026-10-24';
const window = 3;
const nbsp = '\u00a0';

describe('статус периода', () => {
	it.each([
		[
			'оплачен вовремя',
			{ dueDate: '2026-10-20', paid: true, overdue: false, daysOverdue: 0 },
			{ tone: 'paid', label: 'Оплачено', hint: null, lateDays: null },
		],
		[
			'оплачен с опозданием',
			{ dueDate: '2026-10-20', paid: true, overdue: true, daysOverdue: 2 },
			{
				tone: 'late',
				label: 'Оплачено с опозданием',
				hint: null,
				lateDays: 2,
			},
		],
		[
			'просрочен',
			{ dueDate: '2026-10-19', paid: false, overdue: true, daysOverdue: 5 },
			{ tone: 'overdue', label: 'Просрочено', hint: null, lateDays: 5 },
		],
		[
			'срок сегодня',
			{ dueDate: '2026-10-24', paid: false, overdue: false, daysOverdue: 0 },
			{ tone: 'soon', label: 'Срок сегодня', hint: null, lateDays: null },
		],
		[
			'срок завтра',
			{ dueDate: '2026-10-25', paid: false, overdue: false, daysOverdue: 0 },
			{ tone: 'soon', label: 'Срок завтра', hint: null, lateDays: null },
		],
		[
			'последний день окна',
			{ dueDate: '2026-10-27', paid: false, overdue: false, daysOverdue: 0 },
			{
				tone: 'soon',
				label: `Срок через 3${nbsp}дня`,
				hint: null,
				lateDays: null,
			},
		],
		[
			'за окном',
			{ dueDate: '2026-10-31', paid: false, overdue: false, daysOverdue: 0 },
			{
				tone: 'waiting',
				label: 'Не оплачено',
				hint: `срок через 7${nbsp}дней`,
				lateDays: null,
			},
		],
	] as const)('%s', (_, occurrence, expected) => {
		expect(occurrenceStatus(occurrence, today, window)).toEqual(expected);
	});
});
