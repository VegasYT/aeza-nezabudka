import type { PaymentOccurrence } from '@shared/api';
import { formatDate } from '@shared/lib/dates';
import { plural } from '@shared/lib/plural';

/** «1 период», «2 периода», «5 периодов». */
export function formatPeriods(count: number) {
	return plural(count, 'период', 'периода', 'периодов');
}

/** «1 просроченный период», «3 просроченных периода». */
export function formatOverdueCount(count: number) {
	return plural(
		count,
		'просроченный период',
		'просроченных периода',
		'просроченных периодов'
	);
}

/** Подпись периода для доступных имён: «Аренда офиса, срок 19.10.2026». */
export function occurrenceTitle(occurrence: PaymentOccurrence) {
	return `${occurrence.recurringPayment.name}, срок ${formatDate(occurrence.dueDate)}`;
}
