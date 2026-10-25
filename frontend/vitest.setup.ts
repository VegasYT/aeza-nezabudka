import '@testing-library/jest-dom/vitest';
import { notifications } from '@mantine/notifications';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { connectApiClient, sessionStore } from '@shared/auth';
import { apiServer } from '@shared/lib/test-utils';

// Mantine опирается на браузерные API, которых нет в jsdom.
const { getComputedStyle } = window;

window.getComputedStyle = (element) => getComputedStyle(element);
window.HTMLElement.prototype.scrollIntoView = () => {};

window.scrollTo = () => {};

Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	}),
});

window.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

// Первый рендер приложения целиком при параллельном прогоне бывает дольше секунды по умолчанию.
configure({ asyncUtilTimeout: 3000 });

// Запрос без описанного ответа роняет тест: так видно, что сценарий ходит в API.
beforeAll(() => {
	apiServer.listen({ onUnhandledRequest: 'error' });
	connectApiClient();
});

afterEach(() => {
	vi.useRealTimers();
	cleanup();
	notifications.clean();
	apiServer.resetHandlers();
	sessionStore.setState({ session: null, reauthOpen: false });
	window.localStorage.clear();
	window.sessionStorage.clear();
});

afterAll(() => {
	apiServer.close();
});
