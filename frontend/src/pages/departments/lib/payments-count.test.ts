import { describe, expect, it } from 'vitest';

import {
	activePaymentsLabel,
	paymentsCountLabel,
	remainVerb,
} from './payments-count';

describe('число платежей отдела', () => {
	it.each([
		[1, '1\u00a0платёж'],
		[2, '2\u00a0платежа'],
		[4, '4\u00a0платежа'],
		[5, '5\u00a0платежей'],
		[11, '11\u00a0платежей'],
		[12, '12\u00a0платежей'],
		[21, '21\u00a0платёж'],
		[22, '22\u00a0платежа'],
		[111, '111\u00a0платежей'],
	])('%i - «%s»', (count, expected) => {
		expect(paymentsCountLabel(count)).toBe(expected);
	});

	it.each([
		[1, '1\u00a0действующий платёж', 'останется'],
		[2, '2\u00a0действующих платежа', 'останутся'],
		[5, '5\u00a0действующих платежей', 'останутся'],
		[21, '21\u00a0действующий платёж', 'останется'],
	])('%i - «%s», %s', (count, label, verb) => {
		expect(activePaymentsLabel(count)).toBe(label);
		expect(remainVerb(count)).toBe(verb);
	});
});
