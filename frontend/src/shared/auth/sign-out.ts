import { logout } from '@shared/api';

import { clearSession } from './session';

/** Завершает сессию на сервере и во всех вкладках; ошибка запроса выхода не мешает выйти. */
export async function signOut() {
	await logout({ reauth: false }).catch(() => {});
	clearSession();
}
