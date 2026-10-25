import { ActionIcon, Menu } from '@mantine/core';

import type { User } from '@shared/api';
import { IconDots, IconPencil, IconPower, IconTrash } from '@shared/ui/icons';

/** Действие из меню строки участника. */
export type MemberAction = 'role' | 'disable' | 'enable' | 'delete';

interface MemberMenuProps {
	member: User;
	busy: boolean;
	onAction: (action: MemberAction, member: User) => void;
}

/** Кнопка с тремя точками и меню действий с участником. */
export function MemberMenu({ member, busy, onAction }: MemberMenuProps) {
	return (
		<Menu position='bottom-end' width={236}>
			<Menu.Target>
				<ActionIcon
					variant='subtle'
					color='gray'
					size='lg'
					loading={busy}
					aria-label={`Действия: ${member.email}`}
				>
					<IconDots size={20} />
				</ActionIcon>
			</Menu.Target>
			<Menu.Dropdown>
				<Menu.Item
					leftSection={<IconPencil size={18} />}
					onClick={() => onAction('role', member)}
				>
					Сменить роль
				</Menu.Item>
				{member.enabled ? (
					<Menu.Item
						leftSection={<IconPower size={18} />}
						onClick={() => onAction('disable', member)}
					>
						Отключить доступ
					</Menu.Item>
				) : (
					<Menu.Item
						leftSection={<IconPower size={18} />}
						onClick={() => onAction('enable', member)}
					>
						Включить доступ
					</Menu.Item>
				)}
				<Menu.Divider />
				<Menu.Item
					color='var(--mantine-color-error)'
					leftSection={<IconTrash size={18} />}
					onClick={() => onAction('delete', member)}
				>
					Удалить из&nbsp;списка
				</Menu.Item>
			</Menu.Dropdown>
		</Menu>
	);
}
