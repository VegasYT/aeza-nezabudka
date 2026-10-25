import { describe, expect, it } from 'vitest';

import { userAgentLabel } from './user-agent';

const plain = (value: string) => value.replaceAll('\u00a0', ' ');

describe('браузер и система из User-Agent', () => {
	it.each([
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
			'Chrome 130 на Windows',
		],
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
			'Edge 130 на Windows',
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.0.0 Safari/537.36',
			'Яндекс Браузер 24 на macOS',
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
			'Safari 18 на macOS',
		],
		[
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
			'Safari 18 на iPhone',
		],
		[
			'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
			'Chrome 130 на Android',
		],
		[
			'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
			'Firefox 131 на Linux',
		],
		[
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.6723.31 Safari/537.36',
			'Headless Chrome 130 на Linux',
		],
		['curl/8.4.0', 'curl/8.4.0'],
		[
			`Mozilla/5.0 (compatible; ${'x'.repeat(60)})`,
			`Mozilla/5.0 (compatible; ${'x'.repeat(15)}…`,
		],
	])('%s', (agent, expected) => {
		expect(plain(userAgentLabel(agent))).toBe(expected);
	});
});
