import {
	createGroupChatLink,
	createTelegramLink,
	type GroupChat,
	getTelegramStatusOptions,
	type PageGroupChat,
	type TelegramStatus,
} from '@shared/api';

import { groupChatsOptions } from './telegram';
import { useLinkFlow } from './use-link-flow';

/** Привязка личного Telegram: ждём, пока сервер скажет, что чат привязан и бот не заблокирован. */
export function usePersonalLink() {
	return useLinkFlow({
		query: getTelegramStatusOptions(),
		create: () =>
			createTelegramLink({ throwOnError: true }).then(({ data }) => data),
		snapshot: () => null,
		isDone: (status: TelegramStatus) => status.linked && !status.blocked,
	});
}

/** Состояние личного Telegram, ссылка и ожидание привязки. */
export type PersonalLink = ReturnType<typeof usePersonalLink>;

function chatsById(page: PageGroupChat | undefined) {
	return new Map((page?.items ?? []).map((chat) => [chat.id, chat] as const));
}

// Группа подключена: новая в списке, заново по ссылке (новое время подключения) или бот вернулся.
function connectedSince(page: PageGroupChat, since: Map<string, GroupChat>) {
	return page.items.some((chat) => {
		const before = since.get(chat.id);

		return (
			!before ||
			before.linkedAt !== chat.linkedAt ||
			(before.blocked && !chat.blocked)
		);
	});
}

/** Подключение группы: ждём новую группу в списке или возврат бота в заблокированную. */
export function useGroupLink() {
	return useLinkFlow({
		query: groupChatsOptions(),
		create: () =>
			createGroupChatLink({ throwOnError: true }).then(({ data }) => data),
		snapshot: chatsById,
		isDone: connectedSince,
	});
}
