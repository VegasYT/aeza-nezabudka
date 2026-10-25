import { Avatar, Menu, Switch, UnstyledButton } from '@mantine/core';

import { ROLE_LABELS, signOut, useCurrentUser } from '@shared/auth';
import { useColorSchemeToggle } from '@shared/ui/color-scheme-toggle';
import { IconChevronDown, IconLogout } from '@shared/ui/icons';

import classes from './account-menu.module.css';

/** Кнопка аккаунта в шапке: аватар и email, меню с ролью, тёмной темой и «Выйти». */
export function AccountMenu() {
	const user = useCurrentUser();
	const scheme = useColorSchemeToggle();
	const email = user?.email ?? '';
	const initial = email.charAt(0).toUpperCase();
	const role = user ? ROLE_LABELS[user.role] : '';

	return (
		<Menu position='bottom-end' width={264}>
			<Menu.Target>
				<UnstyledButton
					className={classes.account}
					aria-label={`Аккаунт ${email}`}
				>
					<Avatar
						aria-hidden
						color='cyan'
						variant='light'
						size={28}
						radius='sm'
						classNames={{ placeholder: classes.initial }}
					>
						{initial}
					</Avatar>
					<span className={classes.email}>{email}</span>
					<IconChevronDown size={16} className={classes.chevron} />
				</UnstyledButton>
			</Menu.Target>
			<Menu.Dropdown>
				<div className={classes.who}>
					<Avatar
						aria-hidden
						color='cyan'
						variant='light'
						size={32}
						radius='sm'
						classNames={{ placeholder: classes.initial }}
					>
						{initial}
					</Avatar>
					<span className={classes.whoText}>
						<span className={classes.whoEmail}>{email}</span>
						<span className={classes.whoRole}>{role}</span>
					</span>
				</div>
				<Menu.Divider />
				{/* Обычный переключатель, а не пункт меню: щелчок по нему не закрывает меню. */}
				<Switch
					classNames={{ root: classes.scheme, body: classes.schemeBody }}
					label='Тёмная тема'
					labelPosition='left'
					checked={scheme.dark}
					onChange={scheme.toggle}
				/>
				<Menu.Divider />
				<Menu.Item
					leftSection={<IconLogout size={20} />}
					onClick={() => void signOut()}
				>
					Выйти
				</Menu.Item>
			</Menu.Dropdown>
		</Menu>
	);
}
