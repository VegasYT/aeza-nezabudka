import type { CurrencyTotals } from '@shared/api';
import { plural, pluralWord } from '@shared/lib/plural';

/** Значок месяца бюджета: всё оплачено, есть просрочка, есть плановые, ждут оплаты. */
export type MonthKind = 'none' | 'paid' | 'overdue' | 'planned' | 'waiting';

/** Состояние месяца бюджета: значок, текст и выделенная часть про просрочку. */
export interface MonthState {
	kind: MonthKind;
	text: string;
	/** Просрочка - отдельно, её выделяют цветом. */
	warn: string | null;
}

interface Counts {
	total: number;
	paid: number;
	overdue: number;
	planned: number;
}

/** Числа периодов по валютам вместе с плановыми. */
export function countPeriods(currencies: readonly CurrencyTotals[]): Counts {
	return currencies.reduce(
		(sum, totals) => ({
			total: sum.total + totals.count + (totals.plannedCount ?? 0),
			paid: sum.paid + totals.paidCount,
			overdue: sum.overdue + totals.overdueCount,
			planned: sum.planned + (totals.plannedCount ?? 0),
		}),
		{ total: 0, paid: 0, overdue: 0, planned: 0 }
	);
}

function paidPart(count: number) {
	return `${pluralWord(count, 'оплачен', 'оплачено', 'оплачено')} ${count}`;
}

/** Состояние месяца: «1, оплачен», «3: оплачено 2, просрочен 1», «4, из них 2 по расписанию». */
export function monthState(currencies: readonly CurrencyTotals[]): MonthState {
	const { total, paid, overdue, planned } = countPeriods(currencies);

	if (total === 0) {
		return { kind: 'none', text: '—', warn: null };
	}

	if (overdue > 0) {
		return {
			kind: 'overdue',
			text: paid > 0 ? `${total}: ${paidPart(paid)},` : `${total}:`,
			warn: `${pluralWord(overdue, 'просрочен', 'просрочено', 'просрочено')} ${overdue}`,
		};
	}

	if (paid === total) {
		return {
			kind: 'paid',
			text: `${total}, ${total === 1 ? 'оплачен' : 'все оплачены'}`,
			warn: null,
		};
	}

	if (planned > 0) {
		return {
			kind: 'planned',
			text:
				planned === total
					? `${planned}\u00a0по\u00a0расписанию`
					: `${total}, из\u00a0них ${planned}\u00a0по\u00a0расписанию`,
			warn: null,
		};
	}

	return {
		kind: 'waiting',
		text: paid > 0 ? `${total}: ${paidPart(paid)}` : String(total),
		warn: null,
	};
}

/** Итог периодов за год: «17 периодов, оплачено 4». */
export function yearPeriods(currencies: readonly CurrencyTotals[]) {
	const { total, paid } = countPeriods(currencies);

	return `${plural(total, 'период', 'периода', 'периодов')}, оплачено ${paid}`;
}

/** Суммы валюты вместе с плановыми: план, оплачено, просрочено, предстоит. */
export function planOf(totals: CurrencyTotals) {
	const planned = totals.plannedMinor ?? 0;

	return {
		plan: totals.totalMinor + planned,
		paid: totals.paidMinor,
		overdue: totals.overdueMinor,
		upcoming: totals.unpaidMinor - totals.overdueMinor + planned,
		count: totals.count + (totals.plannedCount ?? 0),
	};
}
