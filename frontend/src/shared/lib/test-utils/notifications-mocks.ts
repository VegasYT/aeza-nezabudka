import type { Department, GroupChat, TelegramStatus } from '@shared/api';
import {
	handleGetTelegramStatus,
	handleListDepartments,
	handleListGroupChats,
} from '@shared/api/generated/msw.gen';

import { serveSettings } from './api-mocks';
import { apiServer } from './api-server';

/** Ответ `GET /me/telegram`: по умолчанию Telegram не привязан, бот и общий чат настроены. */
export function telegramStatus(
	overrides: Partial<TelegramStatus> = {}
): TelegramStatus {
	return {
		linked: false,
		telegramUsername: null,
		telegramName: null,
		personalEnabled: false,
		blocked: false,
		groupChatConfigured: true,
		departmentIds: null,
		botConfigured: true,
		...overrides,
	};
}

/**
 * Ответы экрана «Уведомления»: настройки, личный Telegram, отделы и групповые чаты. Без аргументов -
 * Telegram не привязан, отделов и групп нет; вызывай в тестах, которые открывают `/notifications`.
 */
export function serveNotificationsScreen({
	status = telegramStatus(),
	departments = [],
	chats = [],
}: {
	status?: TelegramStatus;
	departments?: Department[];
	chats?: GroupChat[];
} = {}) {
	serveSettings();
	apiServer.use(
		handleGetTelegramStatus({ body: status }),
		handleListDepartments({
			body: { items: departments, total: departments.length },
		}),
		handleListGroupChats({ body: { items: chats, total: chats.length } })
	);
}
