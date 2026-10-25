/** @type {import('stylelint').Config} */
export default {
	extends: ['stylelint-config-standard', 'stylelint-config-css-modules'],
	rules: {
		// Классы CSS-модулей читаются из кода как `styles.pageTitle`.
		'selector-class-pattern': [
			'^[a-z][a-zA-Z0-9]*$',
			{ message: 'Класс CSS-модуля пишется в camelCase' },
		],
		// Миксины `@mixin dark`, `@mixin hover` и другие даёт postcss-preset-mantine.
		'at-rule-no-unknown': [true, { ignoreAtRules: ['mixin'] }],
		// Аргументы миксинов (`@mixin smaller-than $mantine-breakpoint-sm`) разворачивает postcss.
		'at-rule-prelude-no-invalid': [true, { ignoreAtRules: ['mixin'] }],
	},
};
