// Момент из API (`createdAt`, `linkedAt`, `expiresAt`) - точка во времени в UTC, в отличие от
// календарной даты: показывается в часовом поясе браузера. `timeZone` задают тесты.
const formatters = new Map<string, Intl.DateTimeFormat>();

// Создать Intl.DateTimeFormat дорого, а списки форматируют сотни моментов: форматтер на набор опций и пояс один.
function formatter(
	options: Intl.DateTimeFormatOptions,
	timeZone: string | undefined
) {
	const key = `${JSON.stringify(options)}|${timeZone ?? ''}`;
	let cached = formatters.get(key);

	if (!cached) {
		cached = new Intl.DateTimeFormat('ru-RU', { ...options, timeZone });
		formatters.set(key, cached);
	}

	return cached;
}

const day: Intl.DateTimeFormatOptions = {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
};
const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/** Дата момента из API: «01.09.2026». */
export function formatMoment(moment: string, timeZone?: string) {
	return formatter(day, timeZone).format(new Date(moment));
}

/** Дата и время момента из API: «24.10.2026, 10:42». */
export function formatMomentTime(moment: string, timeZone?: string) {
	return formatter({ ...day, ...time }, timeZone).format(new Date(moment));
}

/** Только время момента из API: «14:32». */
export function formatTimeOfDay(moment: string, timeZone?: string) {
	return formatter(time, timeZone).format(new Date(moment));
}
