const KB = 1024;
const MB = KB * KB;

/** Размер файла для людей: «245 КБ», «1,2 МБ»; меньше килобайта - «1 КБ». */
export function formatFileSize(bytes: number) {
	if (bytes < MB) {
		return `${Math.max(1, Math.round(bytes / KB))}\u00a0КБ`;
	}

	return `${(bytes / MB).toFixed(1).replace('.', ',')}\u00a0МБ`;
}
