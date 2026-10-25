import {
	ActionIcon,
	Button,
	Checkbox,
	CloseButton,
	Combobox,
	createTheme,
	Drawer,
	Input,
	Menu,
	Modal,
	Pagination,
	PasswordInput,
	Popover,
	Radio,
	RadioIndicator,
	rem,
	SegmentedControl,
	Tooltip,
} from '@mantine/core';

import { cyan, dark, gray, green, red, yellow } from './palettes';
import classes from './theme.module.css';

// Подписи кнопок пагинации для вспомогательных технологий: у Mantine их нет.
const PAGINATION_CONTROL_LABELS: Partial<Record<string, string>> = {
	previous: 'Предыдущая страница',
	next: 'Следующая страница',
	first: 'Первая страница',
	last: 'Последняя страница',
};

/** Тема Mantine по брендбуку Aéza: палитры, шрифты, скругления и поверхности компонентов. */
export const theme = createTheme({
	primaryColor: 'cyan',
	primaryShade: 6,
	autoContrast: true,
	colors: { cyan, gray, dark, green, yellow, red },
	fontFamily: "'Inter Variable', system-ui, sans-serif",
	headings: {
		fontFamily: "'Exo 2 Variable', 'Inter Variable', system-ui, sans-serif",
		fontWeight: '800',
		sizes: {
			h1: { fontSize: rem(30), lineHeight: '1.1', fontWeight: '900' },
			h2: { fontSize: rem(22), lineHeight: '1.2' },
			h3: { fontSize: rem(18), lineHeight: '1.3' },
		},
	},
	fontSizes: {
		xs: rem(12),
		sm: rem(13),
		md: rem(14),
		lg: rem(16),
		xl: rem(18),
	},
	radius: {
		xs: rem(4),
		sm: rem(6),
		md: rem(9),
		lg: rem(14),
		xl: rem(18),
	},
	defaultRadius: 'md',
	focusClassName: classes.focus,
	components: {
		Input: Input.extend({
			classNames: { wrapper: classes.inputWrapper, input: classes.input },
		}),
		PasswordInput: PasswordInput.extend({
			classNames: { innerInput: classes.input },
		}),
		Popover: Popover.extend({ classNames: { dropdown: classes.raised } }),
		Menu: Menu.extend({
			classNames: { dropdown: classes.raised, item: classes.menuItem },
		}),
		Combobox: Combobox.extend({
			classNames: { dropdown: classes.raised, option: classes.option },
		}),
		Modal: Modal.extend({
			classNames: {
				content: classes.raised,
				header: classes.raisedHeader,
				title: classes.dialogTitle,
			},
		}),
		Drawer: Drawer.extend({
			classNames: {
				content: classes.raised,
				header: classes.raisedHeader,
				title: classes.dialogTitle,
			},
		}),
		Button: Button.extend({ classNames: { root: classes.button } }),
		ActionIcon: ActionIcon.extend({ classNames: { root: classes.actionIcon } }),
		CloseButton: CloseButton.extend({
			classNames: { root: classes.closeButton },
		}),
		Radio: Radio.extend({ classNames: { radio: classes.choice } }),
		RadioIndicator: RadioIndicator.extend({
			classNames: { indicator: classes.choiceIndicator },
		}),
		Checkbox: Checkbox.extend({ classNames: { input: classes.choice } }),
		Tooltip: Tooltip.extend({ classNames: { tooltip: classes.tooltip } }),
		Pagination: Pagination.extend({
			defaultProps: {
				size: 'sm',
				getControlProps: (control) => ({
					'aria-label': PAGINATION_CONTROL_LABELS[control],
				}),
				getItemProps: (page) => ({ 'aria-label': `Страница ${page}` }),
			},
		}),
		SegmentedControl: SegmentedControl.extend({
			classNames: {
				root: classes.segmentedRoot,
				indicator: classes.segmentedIndicator,
				label: classes.segmentedLabel,
			},
		}),
	},
});
