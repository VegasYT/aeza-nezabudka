import { Alert, Button, Skeleton, Text } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { updateUserMutation, type User } from '@shared/api';
import { useCurrentUser } from '@shared/auth';
import { usePhone } from '@shared/lib/media';
import { AddButton } from '@shared/ui/add-button';
import { IconAlertCircle } from '@shared/ui/icons';
import { Island } from '@shared/ui/island';
import { LoadError } from '@shared/ui/list-state';
import { PageTitle } from '@shared/ui/page-title';

import {
	isMemberGone,
	memberActionError,
	membersOptions,
	useRefreshMembers,
} from '../model/members';
import { AddMemberDialog } from './add-member-dialog';
import { ConfirmMemberDialog } from './confirm-member-dialog';
import type { MemberAction } from './member-menu';
import { MembersList, MembersTable } from './members-view';
import { RoleDialog } from './role-dialog';
import classes from './users-page.module.css';

type DialogKind = 'add' | 'role' | 'disable' | 'delete';

// Участник окна остаётся в состоянии и после закрытия: окно гаснет, не теряя содержимого.
interface DialogState {
	kind: DialogKind;
	member: User | null;
	opened: boolean;
}

/** Раздел «Пользователи»: белый список аккаунтов Aéza с ролями. */
export function UsersPage() {
	const phone = usePhone();
	const me = useCurrentUser();
	const members = useQuery(membersOptions());
	const refresh = useRefreshMembers();
	const enable = useMutation({
		...updateUserMutation(),
		onSuccess: refresh,
		onError: (error) => isMemberGone(error) && refresh(),
	});
	const [dialog, setDialog] = useState<DialogState>({
		kind: 'add',
		member: null,
		opened: false,
	});

	const open = (kind: DialogKind, member: User | null = null) =>
		setDialog({ kind, member, opened: true });
	const close = () => setDialog((state) => ({ ...state, opened: false }));

	const onAction = (action: MemberAction, member: User) => {
		if (action === 'enable') {
			enable.mutate({
				path: { user_id: member.id },
				body: { enabled: true },
			});

			return;
		}

		enable.reset();
		open(action, member);
	};

	const items = members.data?.items ?? [];
	const total = members.data?.total ?? 0;
	const onlyAdmins = members.isSuccess && !items.some((m) => m.editable);
	const viewProps = {
		members: items,
		meId: me?.id,
		busyId: enable.isPending ? enable.variables.path.user_id : undefined,
		onAction,
	};

	return (
		<>
			<div className={classes.head}>
				<PageTitle
					note={
						phone ? null : <>вход по&nbsp;аккаунтам Aéza, паролей здесь нет</>
					}
				>
					Пользователи
				</PageTitle>
				<AddButton label='Добавить участника' onClick={() => open('add')} />
			</div>

			{enable.error && (
				<Alert
					variant='light'
					color='red'
					icon={<IconAlertCircle size={18} />}
					title='Не удалось включить доступ'
					withCloseButton
					closeButtonLabel='Скрыть'
					onClose={() => enable.reset()}
				>
					{memberActionError(enable.error)}
				</Alert>
			)}

			<Island
				className={classes.island}
				aria-label='Белый список'
				aria-busy={members.isPending}
			>
				{members.isPending && (
					<div className={classes.skeleton}>
						<Skeleton height={20} width='60%' />
						<Skeleton height={20} width='75%' />
						<Skeleton height={20} width='50%' />
					</div>
				)}
				{members.isError && (
					<LoadError
						title='Не удалось загрузить участников'
						onRetry={() => void members.refetch()}
					/>
				)}
				{members.isSuccess &&
					(phone ? (
						<MembersList {...viewProps} />
					) : (
						<MembersTable {...viewProps} />
					))}
				{onlyAdmins && (
					<div className={classes.note}>
						<span className={classes.noteTitle}>
							Пока входить могут только администраторы
						</span>
						<Text c='dimmed' maw={560}>
							Добавьте email аккаунта Aéza сотрудника. Для другой системы,
							например 1С, выберите роль «Интеграция»: она получит доступ
							к&nbsp;API.
						</Text>
						<Button variant='light' onClick={() => open('add')}>
							Добавить участника
						</Button>
					</div>
				)}
				{total > items.length && (
					<Text size='xs' c='dimmed' className={classes.footer}>
						Показаны первые {items.length} из&nbsp;{total}
					</Text>
				)}
			</Island>
			{phone && (
				<Text size='sm' c='dimmed' className={classes.subtitle}>
					Вход по&nbsp;аккаунтам Aéza, паролей здесь нет.
				</Text>
			)}

			<AddMemberDialog
				opened={dialog.opened && dialog.kind === 'add'}
				onClose={close}
			/>
			<RoleDialog
				member={dialog.member}
				opened={dialog.opened && dialog.kind === 'role'}
				onClose={close}
			/>
			<ConfirmMemberDialog
				kind={dialog.kind === 'delete' ? 'delete' : 'disable'}
				member={dialog.member}
				opened={
					dialog.opened &&
					(dialog.kind === 'disable' || dialog.kind === 'delete')
				}
				onClose={close}
			/>
		</>
	);
}
