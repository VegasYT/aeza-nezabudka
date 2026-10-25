import { useQuery } from '@tanstack/react-query';

import { getCurrentUserOptions } from '@shared/api';

import { useSession } from './session';

/** Опции запроса `GET /auth/me`: роль меняется редко, поэтому профиль не перечитывается на каждом переходе. */
export function currentUserOptions() {
	return { ...getCurrentUserOptions(), staleTime: 5 * 60 * 1000 };
}

/** Текущий участник из `GET /auth/me`; `undefined`, пока ответа нет или сессии нет. */
export function useCurrentUser() {
	const session = useSession();
	const { data } = useQuery({
		...currentUserOptions(),
		enabled: session !== null,
	});

	return session ? data : undefined;
}
