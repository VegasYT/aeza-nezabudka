import { Modal, Stack } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';

import { deleteUserMutation, updateUserMutation, type User } from '@shared/api';
import {
	DialogActions,
	DialogError,
	DialogSubject,
	DialogText,
} from '@shared/ui/dialog';

import {
	isMemberGone,
	memberActionError,
	useRefreshMembers,
} from '../model/members';

/** Необратимое или заметное действие, которое требует подтверждения. */
export type ConfirmKind = 'disable' | 'delete';

function DisableText({ member }: { member: User }) {
	return (
		<>
			{member.role === 'integration' ? (
				<DialogText>
					Запросы этой системы к&nbsp;API сразу перестанут проходить, пока вы
					снова не&nbsp;включите доступ.
				</DialogText>
			) : (
				<DialogText>
					Участник сразу выйдет из&nbsp;панели на&nbsp;всех устройствах
					и&nbsp;не&nbsp;сможет войти, пока вы снова не&nbsp;включите доступ.
					Личные напоминания в&nbsp;Telegram тоже остановятся.
				</DialogText>
			)}
			<DialogText quiet>
				Участник останется в&nbsp;списке, роль и&nbsp;история оплат сохранятся.
			</DialogText>
		</>
	);
}

function DeleteText({ member }: { member: User }) {
	return (
		<>
			{member.role === 'integration' ? (
				<DialogText>
					Система больше не&nbsp;сможет обращаться к&nbsp;API с&nbsp;ключом
					этого аккаунта.
				</DialogText>
			) : (
				<DialogText>
					Участник сразу выйдет из&nbsp;панели и&nbsp;больше не&nbsp;сможет
					войти. Привязка Telegram удалится, личные напоминания перестанут
					приходить.
				</DialogText>
			)}
			<DialogText>
				Отметки об&nbsp;оплате в&nbsp;истории останутся с&nbsp;этим email.
			</DialogText>
			<DialogText quiet>
				Если доступ нужно закрыть на&nbsp;время, лучше отключить его.
			</DialogText>
		</>
	);
}

function ConfirmForm({
	kind,
	member,
	onClose,
}: {
	kind: ConfirmKind;
	member: User;
	onClose: () => void;
}) {
	const refresh = useRefreshMembers();
	const onError = (error: unknown) => isMemberGone(error) && refresh();
	const disable = useMutation({
		...updateUserMutation(),
		onSuccess: refresh,
		onError,
	});
	const remove = useMutation({
		...deleteUserMutation(),
		onSuccess: refresh,
		onError,
	});
	const action = kind === 'disable' ? disable : remove;

	const confirm = async () => {
		const path = { user_id: member.id };

		if (kind === 'disable') {
			await disable.mutateAsync({ path, body: { enabled: false } });
		} else {
			await remove.mutateAsync({ path });
		}

		onClose();
	};

	return (
		<Stack gap='md'>
			<DialogSubject>{member.email}</DialogSubject>
			{kind === 'disable' ? (
				<DisableText member={member} />
			) : (
				<DeleteText member={member} />
			)}
			{action.error && (
				<DialogError>{memberActionError(action.error)}</DialogError>
			)}
			<DialogActions
				confirmLabel={kind === 'disable' ? 'Отключить' : 'Удалить'}
				danger
				pending={action.isPending}
				onCancel={onClose}
				onConfirm={() => void confirm().catch(() => {})}
			/>
		</Stack>
	);
}

/** Окно подтверждения: отключить доступ участника или удалить его из списка. */
export function ConfirmMemberDialog({
	kind,
	member,
	opened,
	onClose,
}: {
	kind: ConfirmKind;
	member: User | null;
	opened: boolean;
	onClose: () => void;
}) {
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title={
				kind === 'disable' ? 'Отключить доступ?' : 'Удалить из\u00a0списка?'
			}
			size={440}
		>
			{member && <ConfirmForm kind={kind} member={member} onClose={onClose} />}
		</Modal>
	);
}
