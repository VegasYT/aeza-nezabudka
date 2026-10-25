import { Modal, Stack } from '@mantine/core';

import { DialogActions, DialogError, DialogText } from '@shared/ui/dialog';

interface ConfirmProps {
	opened: boolean;
	pending: boolean;
	error: string | null;
	onConfirm: () => void;
	onClose: () => void;
}

/** Подтверждение отвязки личного Telegram. */
export function UnlinkDialog({
	username,
	opened,
	pending,
	error,
	onConfirm,
	onClose,
}: ConfirmProps & { username: string | null }) {
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title='Отвязать Telegram?'
			size={430}
		>
			<Stack gap='sm'>
				<DialogText>
					Личные напоминания перестанут приходить в&nbsp;
					<strong>{username ? `@${username}` : 'ваш Telegram'}</strong>.
				</DialogText>
				<DialogText quiet>
					Если нужна пауза, достаточно выключить «Присылать мне лично».
				</DialogText>
				{error && <DialogError>{error}</DialogError>}
				<DialogActions
					confirmLabel='Отвязать'
					danger
					pending={pending}
					onCancel={onClose}
					onConfirm={onConfirm}
				/>
			</Stack>
		</Modal>
	);
}

/** Подтверждение отключения группового чата. */
export function DisconnectDialog({
	title,
	opened,
	pending,
	error,
	onConfirm,
	onClose,
}: ConfirmProps & { title: string }) {
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title='Отключить группу?'
			size={430}
		>
			<Stack gap='sm'>
				<DialogText>
					Бот перестанет писать в&nbsp;группу <strong>«{title}»</strong>,
					неотправленные напоминания не&nbsp;придут.
				</DialogText>
				<DialogText quiet>
					Из&nbsp;самой группы бот не&nbsp;выйдет: удалить его можно
					в&nbsp;Telegram.
				</DialogText>
				{error && <DialogError>{error}</DialogError>}
				<DialogActions
					confirmLabel='Отключить'
					danger
					pending={pending}
					onCancel={onClose}
					onConfirm={onConfirm}
				/>
			</Stack>
		</Modal>
	);
}
