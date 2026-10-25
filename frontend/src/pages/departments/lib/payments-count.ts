import { plural, pluralWord } from '@shared/lib/plural';

/** «1 платёж», «2 платежа», «5 платежей». */
export function paymentsCountLabel(count: number) {
	return plural(count, 'платёж', 'платежа', 'платежей');
}

/** «1 действующий платёж», «2 действующих платежа». */
export function activePaymentsLabel(count: number) {
	return plural(
		count,
		'действующий платёж',
		'действующих платежа',
		'действующих платежей'
	);
}

/** «останется» для одного платежа, «останутся» для остальных чисел. */
export function remainVerb(count: number) {
	return pluralWord(count, 'останется', 'останутся', 'останутся');
}
