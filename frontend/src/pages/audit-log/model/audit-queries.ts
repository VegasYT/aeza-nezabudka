import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
	departmentsOptions,
	LIST_LIMIT,
	listAuditLogInfiniteOptions,
	listUsersOptions,
	nextOffset,
} from '@shared/api';
import type { CalendarDate } from '@shared/lib/dates';

import {
	ACTION_GROUPS,
	type AuditSearch,
	auditPeriod,
	dayEnd,
	dayStart,
} from './audit-search';

/** Сколько записей приходит за раз. */
export const PAGE_SIZE = 50;

// Справочники API отдают не больше 100 строк; участников и отделов у компании меньше.

/** Записи журнала по фильтрам из адреса с подгрузкой «Показать ещё». */
export function useAuditLog(search: AuditSearch, today: CalendarDate) {
	const period = auditPeriod(search, today);
	const group = ACTION_GROUPS.find(({ value }) => value === search.action);

	return useInfiniteQuery({
		...listAuditLogInfiniteOptions({
			query: {
				limit: PAGE_SIZE,
				action: group?.action,
				actorLogin: search.actor,
				from: dayStart(period.from),
				to: dayEnd(period.to),
			},
		}),
		initialPageParam: 0,
		getNextPageParam: nextOffset,
	});
}

/** Участники белого списка для фильтра «Кто»; кэш общий с разделом «Пользователи». */
export function useMembers() {
	return useQuery(listUsersOptions({ query: { limit: LIST_LIMIT } }));
}

/** Отделы, чтобы назвать отделы групповых чатов в подробностях. */
export function useDepartments() {
	return useQuery(departmentsOptions());
}
