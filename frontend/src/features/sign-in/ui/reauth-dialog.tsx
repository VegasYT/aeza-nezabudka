import { Modal } from '@mantine/core';

import { clearSession, useReauthOpen, useSession } from '@shared/auth';

import { LoginForm } from './login-form';

/** Окно повторного входа поверх страницы, когда сессия закончилась посреди работы. */
export function ReauthDialog() {
	const opened = useReauthOpen();
	const session = useSession();

	return (
		<Modal
			opened={opened}
			// Закрывается только входом или «Войти другим аккаунтом»: иначе прерванные запросы повиснут.
			onClose={() => {}}
			title='Сессия закончилась'
			withCloseButton={false}
			closeOnEscape={false}
			closeOnClickOutside={false}
			centered
			radius='xl'
		>
			<LoginForm
				lockedEmail={session?.email ?? ''}
				onSwitchAccount={clearSession}
			/>
		</Modal>
	);
}
