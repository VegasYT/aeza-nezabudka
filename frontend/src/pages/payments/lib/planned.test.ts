import { describe, expect, it } from 'vitest';

import type { PaymentOccurrence, PlannedOccurrence } from '@shared/api';

import {
	mergeByDue,
	plannedForLoaded,
	plannedForPage,
	toPlannedEntries,
} from './planned';

function planned(dueDate: string): PlannedOccurrence {
	return {
		recurringPayment: { id: `p-${dueDate}`, name: 'Сервер', stopped: false },
		department: null,
		dueDate,
		amountMinor: 2500,
		currency: 'USD',
	};
}

function created(dueDate: string): PaymentOccurrence {
	return {
		id: `o-${dueDate}`,
		recurringPayment: { id: 'p-rent', name: 'Аренда', stopped: false },
		department: null,
		dueDate,
		amountMinor: 100,
		currency: 'RUB',
		paid: false,
		paidOn: null,
		paidByLogin: null,
		overdue: false,
		daysOverdue: 0,
	};
}

const entries = toPlannedEntries(
	['2026-11-10', '2026-11-18', '2026-11-20', '2026-11-26'].map(planned),
	[]
);
const dues = (list: { planned: PlannedOccurrence }[]) =>
	list.map((item) => item.planned.dueDate);

describe('плановые на странице таблицы', () => {
	it.each([
		[
			'первая страница, сначала ранние',
			{ order: 'asc', previousLast: null, last: '2026-11-18', lastPage: false },
			['2026-11-10', '2026-11-18'],
		],
		[
			'средняя страница',
			{
				order: 'asc',
				previousLast: '2026-11-18',
				last: '2026-11-20',
				lastPage: false,
			},
			['2026-11-20'],
		],
		[
			'последняя страница',
			{
				order: 'asc',
				previousLast: '2026-11-20',
				last: '2026-11-21',
				lastPage: true,
			},
			['2026-11-26'],
		],
		[
			'без созданных периодов - все',
			{ order: 'asc', previousLast: null, last: null, lastPage: true },
			['2026-11-10', '2026-11-18', '2026-11-20', '2026-11-26'],
		],
		[
			'первая страница, сначала поздние',
			{
				order: 'desc',
				previousLast: null,
				last: '2026-11-20',
				lastPage: false,
			},
			['2026-11-20', '2026-11-26'],
		],
		[
			'последняя страница, сначала поздние',
			{
				order: 'desc',
				previousLast: '2026-11-20',
				last: '2026-11-15',
				lastPage: true,
			},
			['2026-11-10', '2026-11-18'],
		],
	] as const)('%s', (_, bounds, expected) => {
		expect(dues(plannedForPage(entries, bounds))).toEqual(expected);
	});
});

describe('плановые при догрузке на телефоне', () => {
	it('не дальше последнего загруженного, пока есть ещё', () => {
		expect(
			dues(
				plannedForLoaded(entries, {
					order: 'asc',
					lastLoaded: '2026-11-18',
					complete: false,
				})
			)
		).toEqual(['2026-11-10', '2026-11-18']);
	});

	it('всё загружено - все плановые', () => {
		expect(
			plannedForLoaded(entries, {
				order: 'asc',
				lastLoaded: '2026-11-18',
				complete: true,
			})
		).toHaveLength(4);
	});
});

describe('слияние по сроку', () => {
	it('при одинаковом сроке созданный первым', () => {
		const merged = mergeByDue(
			[created('2026-11-18'), created('2026-11-25')],
			toPlannedEntries([planned('2026-11-18'), planned('2026-11-20')], []),
			'asc'
		);

		expect(merged.map((entry) => `${entry.kind}:${entry.key}`)).toEqual([
			'created:o-2026-11-18',
			'planned:p-2026-11-18:2026-11-18',
			'planned:p-2026-11-20:2026-11-20',
			'created:o-2026-11-25',
		]);
	});
});
