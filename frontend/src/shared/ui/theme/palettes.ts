import type { MantineColorsTuple } from '@mantine/core';

// Голубой Aéza: шестой оттенок - фирменный #4CC6F1, восьмой - для текста и фокуса на светлом фоне.
export const cyan: MantineColorsTuple = [
	'#e9faff',
	'#d2f3ff',
	'#ace9ff',
	'#81dcff',
	'#66d1f9',
	'#59cef8',
	'#4cc6f1',
	'#27a7d0',
	'#006e8c',
	'#025066',
];

// Нейтральные серые без оттенка, как Cool Gray 1 C в брендбуке: первый - холст светлой схемы.
export const gray: MantineColorsTuple = [
	'#fafafa',
	'#f4f4f4',
	'#e8e8e8',
	'#d6d6d6',
	'#a6a6a6',
	'#8f8f8f',
	'#6b6b6b',
	'#4d4d4d',
	'#262626',
	'#0d0d0d',
];

// Оттенки тёмной схемы по ролям Mantine: 0 - текст, 2 - приглушённый текст, 6 - кнопки по умолчанию, 7 - остров.
export const dark: MantineColorsTuple = [
	'#f4f4f4',
	'#bdbdbd',
	'#8f8f8f',
	'#5c5c5c',
	'#3a3a3a',
	'#2e2e2e',
	'#262626',
	'#0d0d0d',
	'#080808',
	'#000000',
];

// Шкалы статусов оплаты; токены `--nz-status-*` берут оттенки из них.
export const green: MantineColorsTuple = [
	'#e4ffec',
	'#cbfbd9',
	'#a1f4bc',
	'#5ed48c',
	'#3cc273',
	'#2bae62',
	'#1f9d55',
	'#177a41',
	'#006b33',
	'#00511a',
];

export const yellow: MantineColorsTuple = [
	'#fff6de',
	'#feebc0',
	'#ffd36b',
	'#ffc94a',
	'#ffc21a',
	'#d19600',
	'#b77d00',
	'#936912',
	'#8a6100',
	'#5d3600',
];

export const red: MantineColorsTuple = [
	'#ffedeb',
	'#ffdad9',
	'#ffbdbc',
	'#ff7a7e',
	'#ff5a5f',
	'#e5383b',
	'#c11f25',
	'#9e1a1f',
	'#7f1418',
	'#5c0d10',
];
