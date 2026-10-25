import { AxiosHeaders, isAxiosError } from 'axios';

import type { ErrorResponse } from './generated';

function isErrorResponse(data: unknown): data is ErrorResponse {
	return (
		typeof data === 'object' &&
		data !== null &&
		'error' in data &&
		typeof data.error === 'string' &&
		'message' in data &&
		typeof data.message === 'string'
	);
}

/** Тело ошибки API в формате Aéza v2 или `null`, если сервер не ответил или ответил не в этом формате. */
export function getApiError(error: unknown): ErrorResponse | null {
	if (!isAxiosError(error)) {
		return null;
	}

	const data: unknown = error.response?.data;

	return isErrorResponse(data) ? data : null;
}

/** Текст, когда сервер не ответил или ответил не в формате API. */
export const OFFLINE_MESSAGE =
	'Не удалось связаться с\u00a0сервером. Проверьте подключение и\u00a0попробуйте ещё раз.';

/** Текст ошибки для человека: сообщение сервера или запасной текст. */
export function getApiErrorMessage(error: unknown, fallback = OFFLINE_MESSAGE) {
	return getApiError(error)?.message ?? fallback;
}

/** Код ошибки для программы (`invalid_credentials`, `not_auth`) или `null`. */
export function getApiErrorCode(error: unknown): string | null {
	return getApiError(error)?.error ?? null;
}

/** Тексты ошибок полей из ответа `400 bad_request`: `{ email: 'Неверный формат' }`; для других ошибок пустой объект. */
export function getApiFieldErrors(error: unknown): Record<string, string> {
	const payload = getApiError(error)?.payload;

	if (!Array.isArray(payload)) {
		return {};
	}

	return Object.fromEntries(
		payload.map(({ field, message }) => [field, message])
	);
}

/** Сколько минут ждать по заголовку `Retry-After` (в секундах), с округлением вверх; `null`, если заголовка нет. */
export function getRetryAfterMinutes(error: unknown): number | null {
	if (!isAxiosError(error)) {
		return null;
	}

	const headers = error.response?.headers;
	// Axios отдаёт заголовки объектом AxiosHeaders: имена в нём ищутся без учёта регистра только через get().
	const seconds = Number(
		headers instanceof AxiosHeaders
			? headers.get('retry-after')
			: headers?.['retry-after']
	);

	if (!Number.isFinite(seconds) || seconds <= 0) {
		return null;
	}

	return Math.ceil(seconds / 60);
}
