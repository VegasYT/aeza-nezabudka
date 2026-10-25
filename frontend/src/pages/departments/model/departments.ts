import { useQueryClient } from '@tanstack/react-query';

import {
	getApiErrorCode,
	getApiErrorMessage,
	listDepartmentsQueryKey,
} from '@shared/api';

/** Перечитывает справочник отделов после записи. */
export function useRefreshDepartments() {
	const queryClient = useQueryClient();

	return () =>
		queryClient.invalidateQueries({ queryKey: listDepartmentsQueryKey() });
}

/** Текст причины, по которой сервер отклонил действие с отделом. */
export function departmentActionError(error: unknown) {
	if (getApiErrorCode(error) === 'not_found') {
		return 'Отдел не\u00a0найден: его уже удалили.';
	}

	return getApiErrorMessage(error);
}

/** Ответ «отдела нет» означает, что список устарел и его нужно перечитать. */
export function isDepartmentGone(error: unknown) {
	return getApiErrorCode(error) === 'not_found';
}
