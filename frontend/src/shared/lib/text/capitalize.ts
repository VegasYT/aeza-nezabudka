/** Первая буква заглавная: «ежемесячно» → «Ежемесячно». */
export function capitalize(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
