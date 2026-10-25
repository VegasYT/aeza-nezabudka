import { getSettingsOptions } from './generated/@tanstack/react-query.gen';

/** Опции запроса `GET /settings`: «сегодня» и окно напоминания сервера; дата меняется раз в сутки. */
export function settingsOptions() {
	return { ...getSettingsOptions(), staleTime: 5 * 60 * 1000 };
}
