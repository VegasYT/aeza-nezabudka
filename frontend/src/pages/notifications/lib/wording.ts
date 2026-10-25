import { reminderTiming } from '@entities/recurring-payment';
import type { Department, GroupChat } from '@shared/api';
import { addDays, type CalendarDate, formatDate } from '@shared/lib/dates';
import { formatDays } from '@shared/lib/plural';

/** Когда приходят напоминания: «за 3 дня до срока и в первый день просрочки». */
export function reminderTimes(daysBefore: number) {
	return `${reminderTiming(daysBefore)} и\u00a0в\u00a0первый день просрочки`;
}

/** Образцы сообщений бота в его формате: даты от «сегодня» сервера, платежи для примера. */
export function reminderSamples(today: CalendarDate, daysBefore: number) {
	const when =
		daysBefore > 0
			? `до\u00a0срока оплаты ${formatDays(daysBefore)}`
			: 'срок оплаты сегодня';

	return {
		dueSoon: {
			caption: `${formatDate(today)}, ${reminderTiming(daysBefore)}`,
			text: `Напоминание: ${when}. Сервер (ИТ) - 25,00\u00a0USD, срок ${formatDate(addDays(today, daysBefore))}`,
		},
		overdue: {
			caption: `${formatDate(today)}, первый день просрочки`,
			text: `Просрочена оплата: Аренда офиса (Офис) - 150\u00a0000,00\u00a0RUB, срок был ${formatDate(addDays(today, -1))}`,
		},
	};
}

/** Названия отделов фильтра в порядке справочника; удалённые между запросами пропускаются. */
export function departmentNames(
	departmentIds: readonly string[],
	departments: readonly Department[] | undefined
) {
	return (departments ?? [])
		.filter((department) => departmentIds.includes(department.id))
		.map((department) => department.name)
		.join(', ');
}

/** Какие платежи приходят лично: «Все платежи» или «Только отделы: ИТ, Офис». */
export function personalScopeLabel(
	departmentIds: readonly string[] | null,
	departments: readonly Department[] | undefined
) {
	if (departmentIds === null) {
		return 'Все платежи';
	}

	const names = departmentNames(departmentIds, departments);

	return names ? `Только отделы: ${names}` : 'Только выбранные отделы';
}

/** Какие платежи приходят в группу: «Все платежи» или названия отделов. */
export function chatScopeLabel(
	departmentIds: readonly string[] | null,
	departments: readonly Department[] | undefined
) {
	if (departmentIds === null) {
		return 'Все платежи';
	}

	return departmentNames(departmentIds, departments) || 'Выбранные отделы';
}

/** Подпись подключения группы: «Бухгалтерия → Аренда» для темы, иначе название группы. */
export function chatLabel(
	chat: Pick<GroupChat, 'title' | 'threadId' | 'topicName'>
) {
	if (chat.threadId === null) {
		return chat.title;
	}

	return `${chat.title} → ${chat.topicName ?? 'тема без названия'}`;
}
