/** Какие платежи показаны: по умолчанию действующие. */
export type PaymentsFilter = 'active' | 'stopped' | 'all';

/** Состояние раздела «Регулярные платежи» в адресе; значения по умолчанию в адрес не пишутся. */
export interface RecurringSearch {
	status?: 'stopped' | 'all';
	/** Отдел: id или `none` - платежи без отдела. */
	dept?: string;
	/** Номер страницы с 2; первая не пишется. */
	page?: number;
}

/** Разбирает адрес: неизвестные и битые значения отбрасываются. */
export function validateRecurringSearch(
	raw: Record<string, unknown>
): RecurringSearch {
	const page = Number(raw.page);

	return {
		status:
			raw.status === 'stopped' || raw.status === 'all' ? raw.status : undefined,
		dept:
			typeof raw.dept === 'string' && raw.dept !== '' ? raw.dept : undefined,
		page: Number.isInteger(page) && page > 1 ? page : undefined,
	};
}
