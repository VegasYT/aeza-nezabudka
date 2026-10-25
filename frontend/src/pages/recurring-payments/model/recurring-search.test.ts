import { describe, expect, it } from 'vitest';

import { validateRecurringSearch } from './recurring-search';

describe('адрес раздела «Регулярные платежи»', () => {
	it('берёт известные значения', () => {
		expect(
			validateRecurringSearch({ status: 'stopped', dept: 'none', page: 2 })
		).toEqual({ status: 'stopped', dept: 'none', page: 2 });
	});

	it('отбрасывает неизвестные значения и умолчания', () => {
		expect(
			validateRecurringSearch({ status: 'active', dept: '', page: 1 })
		).toEqual({ status: undefined, dept: undefined, page: undefined });
		expect(validateRecurringSearch({ status: 'paid', page: 'x' })).toEqual({
			status: undefined,
			dept: undefined,
			page: undefined,
		});
	});
});
