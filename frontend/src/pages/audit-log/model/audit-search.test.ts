import { describe, expect, it } from 'vitest';

import { auditPeriod, validateAuditSearch } from './audit-search';

describe('адрес раздела «Журнал»', () => {
	it('берёт известные значения', () => {
		expect(
			validateAuditSearch({
				action: 'occurrences',
				actor: 'buh.petrova@company.ru',
				from: '2026-10-01',
				to: '2026-10-24',
			})
		).toEqual({
			action: 'occurrences',
			actor: 'buh.petrova@company.ru',
			from: '2026-10-01',
			to: '2026-10-24',
		});
	});

	it('отбрасывает неизвестные и битые значения', () => {
		expect(
			validateAuditSearch({
				action: 'payment.*',
				actor: 'someone',
				from: '01.10.2026',
				to: 5,
			})
		).toEqual({
			action: undefined,
			actor: undefined,
			from: undefined,
			to: undefined,
		});
	});

	it('по умолчанию последние 30 дней по сегодня', () => {
		expect(auditPeriod({}, '2026-10-25')).toEqual({
			from: '2026-09-26',
			to: '2026-10-25',
		});
	});
});
