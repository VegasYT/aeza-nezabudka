import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import pluginQuery from '@tanstack/eslint-plugin-query';
import pluginRouter from '@tanstack/eslint-plugin-router';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
	globalIgnores([
		'dist',
		'src/app/routeTree.gen.ts',
		'src/shared/api/generated',
	]),
	{
		files: ['**/*.{ts,tsx}'],
		extends: [
			js.configs.recommended,
			tseslint.configs.recommended,
			reactHooks.configs.flat.recommended,
			reactRefresh.configs.vite,
			pluginQuery.configs['flat/recommended'],
			pluginRouter.configs['flat/recommended'],
		],
		languageOptions: {
			ecmaVersion: 2023,
			globals: globals.browser,
		},
	},
	{
		// Файл маршрута экспортирует `Route`, а не компонент; горячую замену маршрутов делает плагин роутера.
		files: ['src/app/routes/**/*.tsx'],
		rules: {
			'react-refresh/only-export-components': 'off',
		},
	},
	{
		// В строке атрибута JSX экранирование не работает: `\u00a0` показалось бы буквально.
		files: ['**/*.tsx'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'JSXAttribute > Literal[raw=/\\\\u[0-9a-fA-F]{4}/]',
					message:
						"Экранирование в строке атрибута JSX не работает: оберните её в {'…'}.",
				},
			],
		},
	},
	prettier,
	{
		// Пустые строки отделяют логические шаги: Prettier их не расставляет.
		files: ['**/*.{ts,tsx}'],
		plugins: { '@stylistic': stylistic },
		rules: {
			'@stylistic/padding-line-between-statements': [
				'error',
				{ blankLine: 'always', prev: 'block-like', next: '*' },
				{ blankLine: 'always', prev: ['const', 'let'], next: '*' },
				{ blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
				{ blankLine: 'always', prev: '*', next: ['case', 'default'] },
			],
		},
	},
]);
