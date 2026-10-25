// Порядок важен: Edge, Opera и Яндекс Браузер тоже называют себя Chrome и Safari.
const BROWSERS: [RegExp, string][] = [
	[/\bEdg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
	[/\bOPR\/(\d+)/, 'Opera'],
	[/\bYaBrowser\/(\d+)/, 'Яндекс Браузер'],
	[/\bSamsungBrowser\/(\d+)/, 'Samsung Internet'],
	[/\b(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
	// Так входят автотесты и запись видео: Chrome без окна.
	[/\bHeadlessChrome\/(\d+)/, 'Headless Chrome'],
	[/\b(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
	[/\bVersion\/(\d+).*\bSafari\//, 'Safari'],
];

// iPhone и iPad пишут «like Mac OS X», Android - «Linux», поэтому они раньше.
const SYSTEMS: [RegExp, string][] = [
	[/\bWindows\b/, 'Windows'],
	[/\biPhone\b/, 'iPhone'],
	[/\biPad\b/, 'iPad'],
	[/\bAndroid\b/, 'Android'],
	[/\bCrOS\b/, 'ChromeOS'],
	[/\bMac OS X\b/, 'macOS'],
	[/\bLinux\b/, 'Linux'],
];

const UNKNOWN_MAX = 40;

function browserOf(agent: string) {
	for (const [pattern, name] of BROWSERS) {
		const version = pattern.exec(agent)?.[1];

		if (version) {
			return `${name}\u00a0${version}`;
		}
	}

	return null;
}

/** Браузер и система из User-Agent: «Chrome 130 на Windows»; нераспознанную строку (`curl/8.4.0`) показывает как есть. */
export function userAgentLabel(agent: string) {
	const browser = browserOf(agent);

	if (!browser) {
		return agent.length > UNKNOWN_MAX
			? `${agent.slice(0, UNKNOWN_MAX)}…`
			: agent;
	}

	const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1];

	return system ? `${browser} на\u00a0${system}` : browser;
}
