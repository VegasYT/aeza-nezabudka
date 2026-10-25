import { describe, expect, it } from 'vitest';

import type { CurrencyTotals } from '@shared/api';
import { currencyTotals } from '@shared/lib/test-utils';

import { monthState, planOf, yearPeriods } from './budget';

const plain = (text: string | null) => text?.replaceAll('\u00a0', ' ') ?? null;

function counts(
	count: number,
	paidCount: number,
	overdueCount: number,
	plannedCount = 0
): CurrencyTotals[] {
	return [
		currencyTotals({
			currency: 'RUB',
			count,
			paidCount,
			overdueCount,
			unpaidCount: count - paidCount,
			plannedCount,
		}),
	];
}

describe('состояние месяца бюджета', () => {
	it.each([
		['пусто', counts(0, 0, 0), 'none', '—', null],
		['один оплачен', counts(1, 1, 0), 'paid', '1, оплачен', null],
		['все оплачены', counts(3, 3, 0), 'paid', '3, все оплачены', null],
		[
			'просрочен один',
			counts(3, 2, 1),
			'overdue',
			'3: оплачено 2,',
			'просрочен 1',
		],
		[
			'просрочено два',
			counts(5, 1, 2),
			'overdue',
			'5: оплачен 1,',
			'просрочено 2',
		],
		[
			'часть по расписанию',
			counts(2, 0, 0, 2),
			'planned',
			'4, из них 2 по расписанию',
			null,
		],
		[
			'только по расписанию',
			counts(0, 0, 0, 4),
			'planned',
			'4 по расписанию',
			null,
		],
		['ждут оплаты', counts(2, 1, 0), 'waiting', '2: оплачен 1', null],
	] as const)('%s', (_, currencies, kind, text, warn) => {
		const state = monthState(currencies);

		expect(state.kind).toBe(kind);
		expect(plain(state.text)).toBe(text);
		expect(plain(state.warn)).toBe(warn);
	});

	it('валюты складываются только числами периодов', () => {
		expect(monthState([...counts(1, 1, 0), ...counts(1, 0, 1)]).warn).toBe(
			'просрочен 1'
		);
	});
});

describe('итоги года', () => {
	it('число периодов вместе с плановыми', () => {
		expect(plain(yearPeriods(counts(13, 4, 2, 4)))).toBe(
			'17 периодов, оплачено 4'
		);
	});

	it('план валюты включает плановые суммы', () => {
		expect(
			planOf(
				currencyTotals({
					currency: 'RUB',
					totalMinor: 46_480_000,
					paidMinor: 15_980_000,
					unpaidMinor: 30_500_000,
					overdueMinor: 15_000_000,
					plannedMinor: 15_480_000,
					count: 6,
					plannedCount: 2,
				})
			)
		).toEqual({
			plan: 61_960_000,
			paid: 15_980_000,
			overdue: 15_000_000,
			upcoming: 30_980_000,
			count: 8,
		});
	});
});
