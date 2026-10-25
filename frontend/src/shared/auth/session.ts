import { createStore, type StoreApi, useStore } from 'zustand';
import {
	createJSONStorage,
	persist,
	type StateStorage,
} from 'zustand/middleware';

/** Ключ сессии в `sessionStorage`: токен живёт, пока открыта вкладка. */
export const SESSION_STORAGE_KEY = 'nezabudka-session';

/** Сессия веб-панели: токен из входа, срок действия и email для окна повторного входа. */
export interface Session {
	token: string;
	expiresAt: string;
	email: string | null;
}

interface SessionState {
	session: Session | null;
	reauthOpen: boolean;
}

/** Хранилище сессии одной вкладки. */
export type SessionStore = StoreApi<SessionState>;

function isSession(value: unknown): value is Session {
	return (
		typeof value === 'object' &&
		value !== null &&
		'token' in value &&
		typeof value.token === 'string' &&
		'expiresAt' in value &&
		typeof value.expiresAt === 'string'
	);
}

/** Создаёт хранилище сессии, которое держит токен в `storage`; недоступное хранилище - сессия только в памяти. */
export function createSessionStore(storage: () => StateStorage): SessionStore {
	return createStore<SessionState>()(
		persist((): SessionState => ({ session: null, reauthOpen: false }), {
			name: SESSION_STORAGE_KEY,
			storage: createJSONStorage(storage),
			// Окно повторного входа относится к вкладке, а не к сессии: после обновления страницы его нет.
			partialize: ({ session }) => ({ session }),
			// Битое или чужое значение в хранилище - это отсутствие сессии.
			merge: (persisted, current) => {
				const session =
					typeof persisted === 'object' &&
					persisted !== null &&
					'session' in persisted
						? persisted.session
						: null;

				return {
					...current,
					session: isSession(session)
						? { ...session, email: session.email ?? null }
						: null,
				};
			},
		})
	);
}

/** Хранилище сессии этой вкладки. */
export const sessionStore = createSessionStore(() => window.sessionStorage);

/** Текущая сессия вкладки или `null`. */
export function getSession() {
	return sessionStore.getState().session;
}

/** Ставит сессию после входа; email можно дописать позже через `setSessionEmail`. */
export function setSession(session: Session) {
	sessionStore.setState({ session });
}

/** Запоминает email владельца сессии для окна повторного входа. */
export function setSessionEmail(email: string) {
	const { session } = sessionStore.getState();

	if (session && session.email !== email) {
		sessionStore.setState({ session: { ...session, email } });
	}
}

/** Удаляет сессию вкладки: выход, отказ во входе или «Войти другим аккаунтом». */
export function clearSession() {
	sessionStore.setState({ session: null });
}

/** Прошёл ли срок сессии. */
export function isSessionExpired(session: Session) {
	return Date.parse(session.expiresAt) <= Date.now();
}

/** Текущая сессия для компонентов; перерисовывает их при входе и выходе. */
export function useSession() {
	return useStore(sessionStore, (state) => state.session);
}

/** Открыто ли окно повторного входа. */
export function useReauthOpen() {
	return useStore(sessionStore, (state) => state.reauthOpen);
}
