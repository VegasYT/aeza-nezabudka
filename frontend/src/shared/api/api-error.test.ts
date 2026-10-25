import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';

import { apiErrorBody } from '@shared/lib/test-utils';

import {
	getApiErrorCode,
	getApiFieldErrors,
	getRetryAfterMinutes,
} from './api-error';

function responseError(
	status: number,
	data: unknown,
	headers: Record<string, string> = {}
) {
	const response = {
		status,
		statusText: '',
		data,
		headers: new AxiosHeaders(headers),
		config: { headers: new AxiosHeaders() },
	} satisfies AxiosResponse;

	return new AxiosError(
		'Request failed',
		String(status),
		undefined,
		undefined,
		response
	);
}

describe('ошибки API', () => {
	it('код ошибки берётся из тела в формате Aéza v2', () => {
		expect(
			getApiErrorCode(responseError(400, apiErrorBody(400, 'invalid_code')))
		).toBe('invalid_code');
	});

	it('без ответа сервера кода нет', () => {
		expect(getApiErrorCode(new AxiosError('Network Error'))).toBeNull();
	});

	it('минуты ожидания округляются вверх', () => {
		const error = responseError(429, apiErrorBody(429, 'too_many_attempts'), {
			'Retry-After': '401',
		});

		expect(getRetryAfterMinutes(error)).toBe(7);
	});

	it('ошибки полей собираются из payload ответа 400', () => {
		const error = responseError(400, {
			...apiErrorBody(400, 'bad_request'),
			payload: [
				{ field: 'email', message: 'Неверный формат' },
				{ field: 'role', message: 'Допустимые значения: user, integration' },
			],
		});

		expect(getApiFieldErrors(error)).toEqual({
			email: 'Неверный формат',
			role: 'Допустимые значения: user, integration',
		});
	});

	it('у ошибки без списка полей и без ответа ошибок полей нет', () => {
		expect(
			getApiFieldErrors(responseError(409, apiErrorBody(409, 'login_taken')))
		).toEqual({});
		expect(getApiFieldErrors(new AxiosError('Network Error'))).toEqual({});
	});
});
