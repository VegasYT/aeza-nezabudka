import type { Currency } from '@shared/api';

/** Валюты API в порядке показа: итоги по каждой отдельно, без конвертации. */
export const CURRENCIES = [
	'RUB',
	'USD',
	'EUR',
] as const satisfies readonly Currency[];
