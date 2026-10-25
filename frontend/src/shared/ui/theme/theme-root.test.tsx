import { expect, it } from 'vitest';

import { renderWithTheme, stubMatchMedia } from '@shared/lib/test-utils';

import indexHtml from '../../../../index.html?raw';
import { COLOR_SCHEME_STORAGE_KEY } from './color-scheme';

const appliedScheme = () =>
	document.documentElement.getAttribute('data-mantine-color-scheme');

it('без сохранённого выбора схема следует теме системы', () => {
	stubMatchMedia({ colorScheme: 'dark' });

	renderWithTheme(<p>Незабудка</p>);

	expect(appliedScheme()).toBe('dark');
});

it('сохранённый выбор важнее темы системы', () => {
	stubMatchMedia({ colorScheme: 'dark' });
	window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'light');

	renderWithTheme(<p>Незабудка</p>);

	expect(appliedScheme()).toBe('light');
});

it('скрипт в index.html читает схему по тому же ключу, что и тема', () => {
	expect(indexHtml).toContain(`'${COLOR_SCHEME_STORAGE_KEY}'`);
});
