import type { Role } from '@shared/api';
import { handleGetCurrentUser } from '@shared/api/generated/msw.gen';
import { setSession } from '@shared/auth';

import { accountEmail, hoursFromNow } from './api-mocks';
import { apiServer } from './api-server';

/** Входит в панель с ролью `role`: сессия `token-<role>` на 12 часов и ответ `GET /auth/me`; вызывай до рендера. */
export function signIn(role: Role = 'admin') {
	const email = accountEmail(role);

	setSession({ token: `token-${role}`, expiresAt: hoursFromNow(12), email });
	apiServer.use(
		handleGetCurrentUser({ body: { id: `id-${role}`, email, role } })
	);

	return { email };
}
