import { AxiosHeaders, isAxiosError } from 'axios';

import { apiClient, getApiErrorCode } from '@shared/api';

import { requestReauth } from './reauth';
import { getSession } from './session';

declare module 'axios' {
	interface AxiosRequestConfig {
		/** `false` - при `401` не ждать повторного входа: выход и уже повторённый запрос. */
		reauth?: boolean;
	}
}

/** Подставляет токен сессии в запросы; при `401 not_auth` ждёт повторного входа и повторяет запрос. */
export function connectApiClient() {
	apiClient.setConfig({ auth: () => getSession()?.token });
	apiClient.instance.interceptors.response.use(undefined, async (error) => {
		const config = isAxiosError(error) ? error.config : undefined;
		const headers = AxiosHeaders.from(config?.headers);

		if (
			!config ||
			config.reauth === false ||
			getApiErrorCode(error) !== 'not_auth' ||
			!String(headers.get('Authorization')).startsWith('Bearer ')
		) {
			throw error;
		}

		const token = await requestReauth();

		return apiClient.instance.request({
			...config,
			reauth: false,
			headers: headers.set('Authorization', `Bearer ${token}`),
		});
	});
}
