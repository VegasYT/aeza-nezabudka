import { describe, expect, it } from 'vitest';

import { chatLabel, reminderSamples } from './wording';

// toBe сравнивает строки как есть: неразрывные пробелы в ожиданиях обычные, поэтому сводим.
const plain = (text: string) => text.replaceAll('\u00a0', ' ');

describe('образцы напоминаний в формате бота', () => {
	it('до срока и просрочка от сегодня сервера', () => {
		const { dueSoon, overdue } = reminderSamples('2026-10-24', 3);

		expect(plain(dueSoon.text)).toBe(
			'Напоминание: до срока оплаты 3 дня. Сервер (ИТ) - 25,00 USD, срок 27.10.2026'
		);
		expect(plain(overdue.text)).toBe(
			'Просрочена оплата: Аренда офиса (Офис) - 150 000,00 RUB, срок был 23.10.2026'
		);
	});

	it('окно 0 - срок сегодня', () => {
		const { dueSoon } = reminderSamples('2026-10-24', 0);

		expect(plain(dueSoon.text)).toBe(
			'Напоминание: срок оплаты сегодня. Сервер (ИТ) - 25,00 USD, срок 24.10.2026'
		);
	});
});

describe('подпись подключения группы', () => {
	it.each([
		[null, null, 'Бухгалтерия'],
		[12, 'Аренда', 'Бухгалтерия → Аренда'],
		[12, null, 'Бухгалтерия → тема без названия'],
	])('тема %s «%s» - «%s»', (threadId, topicName, expected) => {
		expect(chatLabel({ title: 'Бухгалтерия', threadId, topicName })).toBe(
			expected
		);
	});
});
