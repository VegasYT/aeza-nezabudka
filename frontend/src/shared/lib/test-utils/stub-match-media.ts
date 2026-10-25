import { vi } from 'vitest';

const BASE_FONT_SIZE = 16;

function toPixels(value: string, unit: string) {
	return unit === 'em' || unit === 'rem'
		? Number(value) * BASE_FONT_SIZE
		: Number(value);
}

function matches(query: string, width: number, colorScheme: 'light' | 'dark') {
	return query.split(/\s+and\s+/).every((part) => {
		const scheme = /prefers-color-scheme:\s*(light|dark)/.exec(part);

		if (scheme) {
			return scheme[1] === colorScheme;
		}

		const size = /(min|max)-width:\s*([\d.]+)(px|em|rem)/.exec(part);

		if (!size) {
			return false;
		}

		const [, bound = 'min', value = '0', unit = 'px'] = size;
		const limit = toPixels(value, unit);

		return bound === 'min' ? width >= limit : width <= limit;
	});
}

/** Подменяет `matchMedia` под окно заданной ширины и тему системы; после теста Vitest вернёт оригинал. */
export function stubMatchMedia({
	width = 1440,
	colorScheme = 'light',
}: {
	width?: number;
	colorScheme?: 'light' | 'dark';
} = {}) {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: matches(query, width, colorScheme),
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	}));
}
