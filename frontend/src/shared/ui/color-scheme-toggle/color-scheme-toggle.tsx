import { ActionIcon } from '@mantine/core';

import { IconMoon, IconSun } from '@shared/ui/icons';

import { useColorSchemeToggle } from './use-color-scheme-toggle';

/** Кнопка-значок схемы для страницы входа, где нет меню аккаунта. */
export function ColorSchemeToggle() {
	const { dark, toggle } = useColorSchemeToggle();

	return (
		<ActionIcon
			variant='default'
			size={36}
			role='switch'
			aria-checked={dark}
			aria-label='Тёмная тема'
			onClick={toggle}
		>
			{dark ? <IconMoon size={18} /> : <IconSun size={18} />}
		</ActionIcon>
	);
}
