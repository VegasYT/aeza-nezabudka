import '@fontsource-variable/exo-2';
import '@fontsource-variable/inter';
import '@mantine/core/styles.layer.css';
import '@mantine/dates/styles.layer.css';
import '@mantine/notifications/styles.layer.css';
import 'dayjs/locale/ru';
import './global.css';

import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';

import { colorSchemeManager } from './color-scheme';
import { theme } from './theme';
import classes from './theme.module.css';
import { cssVariablesResolver } from './tokens';

/** Корень темы Mantine: схема из настроек системы по умолчанию, русский календарь, всплывающие уведомления; в тестах `env="test"` выключает анимации и порталы. */
export function ThemeRoot({
	children,
	env,
}: {
	children: ReactNode;
	env?: 'default' | 'test';
}) {
	return (
		<MantineProvider
			theme={theme}
			cssVariablesResolver={cssVariablesResolver}
			colorSchemeManager={colorSchemeManager}
			defaultColorScheme='auto'
			env={env}
		>
			<DatesProvider
				settings={{ locale: 'ru', firstDayOfWeek: 1, weekendDays: [] }}
			>
				{children}
			</DatesProvider>
			<Notifications
				position='bottom-center'
				classNames={{ root: classes.notifications }}
			/>
		</MantineProvider>
	);
}
