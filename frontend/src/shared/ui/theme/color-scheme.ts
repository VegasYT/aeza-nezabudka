import { localStorageColorSchemeManager } from '@mantine/core';

/** Ключ выбранной схемы в `localStorage`; тот же ключ читает скрипт в `index.html` до загрузки приложения. */
export const COLOR_SCHEME_STORAGE_KEY = 'nezabudka-color-scheme';

/** Хранит выбранную схему в браузере; ошибки хранилища менеджер Mantine гасит сам. */
export const colorSchemeManager = localStorageColorSchemeManager({
	key: COLOR_SCHEME_STORAGE_KEY,
});
