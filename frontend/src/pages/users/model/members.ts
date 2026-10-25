import { useQueryClient } from '@tanstack/react-query';

import {
	getApiErrorCode,
	getApiErrorMessage,
	listUsersOptions,
	listUsersQueryKey,
} from '@shared/api';

/** Сколько участников запрашивается: это предел API, у одной компании их десятки. */
export const MEMBERS_LIMIT = 100;

/** Запрос белого списка для раздела «Пользователи». */
export function membersOptions() {
	return listUsersOptions({ query: { limit: MEMBERS_LIMIT } });
}

/** Перечитывает белый список после записи. */
export function useRefreshMembers() {
	const queryClient = useQueryClient();

	return () => queryClient.invalidateQueries({ queryKey: listUsersQueryKey() });
}

/** Текст причины, по которой сервер отклонил действие с участником. */
export function memberActionError(error: unknown) {
	switch (getApiErrorCode(error)) {
		case 'admin_protected':
			return 'Этот участник задан в\u00a0настройках сервера, в\u00a0панели его не\u00a0изменить.';

		case 'not_found':
			return 'Участник не\u00a0найден: его уже удалили.';

		default:
			return getApiErrorMessage(error);
	}
}

/** Ответ «участника нет» означает, что список устарел и его нужно перечитать. */
export function isMemberGone(error: unknown) {
	return getApiErrorCode(error) === 'not_found';
}
