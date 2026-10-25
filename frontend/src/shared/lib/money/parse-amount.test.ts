import { describe, expect, it } from 'vitest';

import { formatAmount } from './format-money';
import { parseAmount } from './parse-amount';

describe('сумма из поля формы', () => {
	it.each([
		['15,00', 1_500],
		['15', 1_500],
		['12.99', 1_299],
		['150 000,5', 15_000_050],
		['150\u00a0000,00', 15_000_000],
		['0,01', 1],
		[' 7, ', 700],
	])('«%s» → %i', (text, amountMinor) => {
		expect(parseAmount(text)).toEqual({ amountMinor });
	});

	it.each([
		['', 'Введите сумму'],
		['   ', 'Введите сумму'],
		['abc', 'Сумма должна быть числом'],
		['-5', 'Сумма должна быть числом'],
		['1,2,3', 'Сумма должна быть числом'],
		['1,234', 'Не больше двух знаков после запятой'],
		['0', 'Сумма должна быть больше нуля'],
		['0,00', 'Сумма должна быть больше нуля'],
		['99999999999999999', 'Слишком большая сумма'],
	])('«%s» - %s', (text, error) => {
		expect(parseAmount(text)).toEqual({ error });
	});

	it('сумма из формы разбирается обратно в те же единицы', () => {
		expect(parseAmount(formatAmount(15_000_050))).toEqual({
			amountMinor: 15_000_050,
		});
	});
});
