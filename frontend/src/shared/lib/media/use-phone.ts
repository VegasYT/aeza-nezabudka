import { useMatches } from '@mantine/core';

/** Окно уже `sm` (768 px): телефонная раскладка - карточки, листы снизу, окна во весь экран. */
export function usePhone() {
	// Значение читается сразу при отрисовке: иначе на телефоне сначала мелькнула бы и запросилась раскладка компьютера.
	return useMatches(
		{ base: true, sm: false },
		{ getInitialValueInEffect: false }
	);
}
