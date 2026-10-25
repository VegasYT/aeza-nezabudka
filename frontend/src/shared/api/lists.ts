import { listDepartmentsOptions } from './generated/@tanstack/react-query.gen';

/** Предел списков API: отделов, участников и групп у одной компании единицы, одинаковый предел даёт общий кэш. */
export const LIST_LIMIT = 100;

/** Справочник отделов: один запрос и один кэш на все разделы. */
export function departmentsOptions() {
	return listDepartmentsOptions({ query: { limit: LIST_LIMIT } });
}

/** Смещение следующей страницы `{ items, total }` для `useInfiniteQuery`; `undefined`, когда загружено всё. */
export function nextOffset(
	last: { total: number },
	pages: readonly { items: readonly unknown[] }[]
) {
	const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);

	return loaded < last.total ? loaded : undefined;
}
