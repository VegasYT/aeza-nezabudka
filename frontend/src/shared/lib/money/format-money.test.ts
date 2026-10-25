import { describe, expect, it } from 'vitest';

import { formatMoney } from './format-money';

const nbsp = '\u00a0';

describe('сумма из минимальных единиц', () => {
	it.each([
		[15_000_000, 'RUB', `150${nbsp}000,00${nbsp}₽`],
		[1_299, 'EUR', `12,99${nbsp}€`],
		[2_500, 'USD', `25,00${nbsp}$`],
		[0, 'RUB', `0,00${nbsp}₽`],
		[123_456_789, 'USD', `1${nbsp}234${nbsp}567,89${nbsp}$`],
	] as const)('%i %s → %s', (amountMinor, currency, expected) => {
		expect(formatMoney(amountMinor, currency)).toBe(expected);
	});
});
