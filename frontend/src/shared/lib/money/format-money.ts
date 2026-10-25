import type { Currency } from '@shared/api';

const CURRENCY_SIGNS: Record<Currency, string> = {
	RUB: '₽',
	USD: '$',
	EUR: '€',
};

// У всех трёх валют по 100 минимальных единиц (ADR-007).
export const MINOR_UNITS = 100;

const amountFormat = new Intl.NumberFormat('ru-RU', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/** Сумма из минимальных единиц без знака валюты: «150 000,00»; так её показывает поле формы. */
export function formatAmount(amountMinor: number) {
	// Разделитель разрядов в ICU бывает узким неразрывным пробелом: приводим к одному виду.
	return amountFormat
		.format(amountMinor / MINOR_UNITS)
		.replace(/\s/g, '\u00a0');
}

/** Сумма из минимальных единиц со знаком валюты: «150 000,00 ₽». */
export function formatMoney(amountMinor: number, currency: Currency) {
	return `${formatAmount(amountMinor)}\u00a0${currencySign(currency)}`;
}

/** Знак валюты: «₽», «$», «€». */
export function currencySign(currency: Currency) {
	return CURRENCY_SIGNS[currency];
}
