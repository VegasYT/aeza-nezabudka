import {
	getApiErrorCode,
	getApiErrorMessage,
	LIST_LIMIT,
	listGroupChatsOptions,
} from '@shared/api';

/** Как часто перечитывается состояние, пока ссылка на бота действует. */
export const POLL_INTERVAL = 3000;

/** Групповые чаты, подключённые администратором. */
export function groupChatsOptions() {
	return listGroupChatsOptions({ query: { limit: LIST_LIMIT } });
}

/** Почему не получилось выдать ссылку на бота. */
export type LinkFailure =
	| { kind: 'not_configured' }
	| { kind: 'unavailable' }
	| { kind: 'other'; message: string };

export function linkFailure(error: unknown): LinkFailure {
	switch (getApiErrorCode(error)) {
		case 'telegram_not_configured':
			return { kind: 'not_configured' };

		case 'telegram_unavailable':
			return { kind: 'unavailable' };

		default:
			return { kind: 'other', message: getApiErrorMessage(error) };
	}
}
