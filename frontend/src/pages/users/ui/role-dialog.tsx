import { Modal, Stack } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { type MemberRole, updateUserMutation, type User } from '@shared/api';
import {
	DialogActions,
	DialogError,
	DialogInfo,
	DialogSubject,
} from '@shared/ui/dialog';

import {
	isMemberGone,
	memberActionError,
	useRefreshMembers,
} from '../model/members';
import { RoleChoice } from './role-choice';

function RoleForm({ member, onClose }: { member: User; onClose: () => void }) {
	const current: MemberRole =
		member.role === 'integration' ? 'integration' : 'user';
	const [role, setRole] = useState<MemberRole>(current);
	const refresh = useRefreshMembers();
	const update = useMutation({
		...updateUserMutation(),
		onSuccess: refresh,
		onError: (error) => isMemberGone(error) && refresh(),
	});
	const changed = role !== current;

	const confirm = async () => {
		await update.mutateAsync({
			path: { user_id: member.id },
			body: { role },
		});
		onClose();
	};

	return (
		<Stack gap='md'>
			<DialogSubject>{member.email}</DialogSubject>
			<RoleChoice value={role} onChange={setRole} current={current} />
			{changed && (
				<DialogInfo>
					{role === 'integration'
						? 'Вход в\u00a0панель для этой роли закрыт: участник сразу выйдет из\u00a0панели. Аккаунт будет работать через API по\u00a0ключу X-API-KEY.'
						: 'Аккаунт сможет входить в\u00a0панель и\u00a0отмечать оплату.'}
				</DialogInfo>
			)}
			{update.error && (
				<DialogError>{memberActionError(update.error)}</DialogError>
			)}
			<DialogActions
				confirmLabel='Сменить роль'
				pending={update.isPending}
				disabled={!changed}
				onCancel={onClose}
				onConfirm={() => void confirm().catch(() => {})}
			/>
		</Stack>
	);
}

/** Окно «Сменить роль»: пользователь или интеграция. */
export function RoleDialog({
	member,
	opened,
	onClose,
}: {
	member: User | null;
	opened: boolean;
	onClose: () => void;
}) {
	return (
		<Modal opened={opened} onClose={onClose} title='Сменить роль' size={440}>
			{member && <RoleForm member={member} onClose={onClose} />}
		</Modal>
	);
}
