import { useMatches } from '@mantine/core';

/** Вид навигации по ширине окна: подписи от `lg`, значки от `sm`, нижняя панель на телефоне. */
export function useNavMode() {
	// Значение читается сразу при отрисовке, чтобы при загрузке не мелькал другой вид навигации.
	return useMatches<'full' | 'compact' | 'bar'>(
		{ base: 'bar', sm: 'compact', lg: 'full' },
		{ getInitialValueInEffect: false }
	);
}
