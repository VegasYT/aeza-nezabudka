import { isSessionExpired, sessionStore } from './session';

/** Сессия завершена без повторного входа: прерванные запросы не повторяются. */
export class SessionEndedError extends Error {
	constructor() {
		super('Сессия завершена');
		this.name = 'SessionEndedError';
	}
}

interface PendingReauth {
	promise: Promise<string>;
	resolve: (token: string) => void;
	reject: (error: SessionEndedError) => void;
}

let pending: PendingReauth | null = null;

function settle(finish: (reauth: PendingReauth) => void) {
	const current = pending;

	pending = null;
	sessionStore.setState({ reauthOpen: false });

	if (current) {
		finish(current);
	}
}

// Новый токен (вход в окне или в другой вкладке) завершает ожидание, выход - отменяет его.
sessionStore.subscribe((state, previous) => {
	if (!pending) {
		return;
	}

	const { session } = state;

	if (!session) {
		settle((reauth) => reauth.reject(new SessionEndedError()));
	} else if (
		session.token !== previous.session?.token &&
		!isSessionExpired(session)
	) {
		settle((reauth) => reauth.resolve(session.token));
	}
});

/** Открывает окно повторного входа (одно на все вызовы) и ждёт нового токена. */
export function requestReauth(): Promise<string> {
	if (!sessionStore.getState().session) {
		return Promise.reject(new SessionEndedError());
	}

	if (!pending) {
		let resolve: PendingReauth['resolve'] = () => {};
		let reject: PendingReauth['reject'] = () => {};
		const promise = new Promise<string>((onResolve, onReject) => {
			resolve = onResolve;
			reject = onReject;
		});

		pending = { promise, resolve, reject };
		sessionStore.setState({ reauthOpen: true });
	}

	return pending.promise;
}
