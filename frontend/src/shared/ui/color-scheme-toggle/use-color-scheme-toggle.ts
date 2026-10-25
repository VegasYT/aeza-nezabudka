import { useComputedColorScheme, useMantineColorScheme } from '@mantine/core';

/** Действующая схема и переключение светлой и тёмной; пока выбора нет, схема следует системе. */
export function useColorSchemeToggle() {
	const { setColorScheme } = useMantineColorScheme();
	// Схему до загрузки ставит скрипт в index.html: значение читается сразу, без кадра со светлой.
	const dark =
		useComputedColorScheme('light', { getInitialValueInEffect: false }) ===
		'dark';

	return { dark, toggle: () => setColorScheme(dark ? 'light' : 'dark') };
}
