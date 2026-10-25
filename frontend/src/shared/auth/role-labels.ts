import type { Role } from '@shared/api';

/** Название роли в интерфейсе. */
export const ROLE_LABELS: Record<Role, string> = {
	admin: 'Администратор',
	user: 'Пользователь',
	integration: 'Интеграция',
};
