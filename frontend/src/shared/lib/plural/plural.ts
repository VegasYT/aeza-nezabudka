const forms = new Intl.PluralRules('ru');

/** Слово в форме для числа, без самого числа: «день», «дня», «дней». */
export function pluralWord(
	count: number,
	one: string,
	few: string,
	many: string
) {
	const form = forms.select(count);

	return form === 'one' ? one : form === 'few' ? few : many;
}

/** Число со словом в нужной форме через неразрывный пробел: «1 период», «2 периода», «5 периодов». */
export function plural(count: number, one: string, few: string, many: string) {
	return `${count}\u00a0${pluralWord(count, one, few, many)}`;
}

/** «1 день», «2 дня», «5 дней». */
export function formatDays(days: number) {
	return plural(days, 'день', 'дня', 'дней');
}
