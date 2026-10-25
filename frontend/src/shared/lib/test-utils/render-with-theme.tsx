import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { ThemeRoot } from '@shared/ui/theme';

/** Рендерит компонент внутри темы Mantine, как в приложении. */
export function renderWithTheme(
	ui: ReactElement,
	options?: Omit<RenderOptions, 'wrapper'>
) {
	return render(ui, {
		wrapper: ({ children }: { children: ReactNode }) => (
			<ThemeRoot env='test'>{children}</ThemeRoot>
		),
		...options,
	});
}
