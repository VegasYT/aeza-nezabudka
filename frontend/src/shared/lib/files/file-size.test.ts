import { describe, expect, it } from 'vitest';

import { formatFileSize } from './file-size';

describe('размер файла', () => {
	it.each([
		[200, '1 КБ'],
		[250_000, '244 КБ'],
		[1_258_291, '1,2 МБ'],
		[10 * 1024 * 1024, '10,0 МБ'],
	])('%i байт - «%s»', (bytes, expected) => {
		expect(formatFileSize(bytes).replace('\u00a0', ' ')).toBe(expected);
	});
});
