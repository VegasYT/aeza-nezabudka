import { MINOR_UNITS } from './format-money';

/** Почему сумма из поля не подходит: текст для пользователя. */
export type AmountError =
	| 'Введите сумму'
	| 'Сумма должна быть числом'
	| 'Не больше двух знаков после запятой'
	| 'Сумма должна быть больше нуля'
	| 'Слишком большая сумма';

// Пробелы любого вида - разделители разрядов, дробная часть через запятую или точку.
const AMOUNT = /^(\d+)(?:[.,](\d*))?$/;

/** Сумма из поля формы в минимальных единицах: «150 000,50» → 15000050; иначе текст ошибки. */
export function parseAmount(
	text: string
): { amountMinor: number } | { error: AmountError } {
	const compact = text.replace(/\s/g, '');

	if (compact === '') {
		return { error: 'Введите сумму' };
	}

	const match = AMOUNT.exec(compact);

	if (!match) {
		return { error: 'Сумма должна быть числом' };
	}

	const [, whole = '', fraction = ''] = match;

	if (fraction.length > 2) {
		return { error: 'Не больше двух знаков после запятой' };
	}

	const amountMinor =
		Number(whole) * MINOR_UNITS + Number(fraction.padEnd(2, '0'));

	if (amountMinor === 0) {
		return { error: 'Сумма должна быть больше нуля' };
	}

	if (!Number.isSafeInteger(amountMinor)) {
		return { error: 'Слишком большая сумма' };
	}

	return { amountMinor };
}
