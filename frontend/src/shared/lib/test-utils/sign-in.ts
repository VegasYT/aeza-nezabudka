import type { Role } from '@shared/api';
import { handleGetCurrentUser } from '@shared/api/generated/msw.gen';
import { setSession } from '@shared/auth';

import { accountEmail, hoursFromNow } from './api-mocks';
import { apiServer } from './api-server';
import { serveLiveEvents } from './live-mocks';

/** Входит в панель с ролью `role`: сессия `token-<role>` на 12 часов, ответ `GET /auth/me` и поток событий; вызывай до рендера. */
export function signIn(role: Role = 'admin') {
	const email = accountEmail(role);

	setSession({ token: `token-${role}`, expiresAt: hoursFromNow(12), email });
	apiServer.use(
		handleGetCurrentUser({ body: { id: `id-${role}`, email, role } })
	);
	// Панель после входа подключается к потоку событий; тест, которому нужны события, вызывает serveLiveEvents сам.
	serveLiveEvents();

	return { email };
}
