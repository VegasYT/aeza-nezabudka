import { Table, VisuallyHidden } from '@mantine/core';

import type { User } from '@shared/api';
import { ROLE_LABELS } from '@shared/auth';
import { formatMoment, formatMomentTime } from '@shared/lib/dates';
import { IconLock } from '@shared/ui/icons';

import { activityLabel } from '../lib/format';
import { type MemberAction, MemberMenu } from './member-menu';
import classes from './users-page.module.css';

const lockedNote =
	'Задан в\u00a0настройках сервера, в\u00a0панели не\u00a0меняется';

interface MembersViewProps {
	members: User[];
	/** Id текущего участника: его строка помечена «это вы». */
	meId: string | undefined;
	/** Id участника, которому сейчас включают доступ. */
	busyId: string | undefined;
	onAction: (action: MemberAction, member: User) => void;
}

function RoleBadge({ role }: { role: User['role'] }) {
	return (
		<span className={classes.role} data-role={role}>
			{ROLE_LABELS[role]}
		</span>
	);
}

function Email({ member, meId }: { member: User; meId: string | undefined }) {
	return (
		<span
			className={classes.email}
			data-disabled={!member.enabled || undefined}
		>
			{member.email}
			{member.id === meId && <span className={classes.me}>это вы</span>}
		</span>
	);
}

function Locked() {
	return (
		<span
			className={classes.locked}
			role='img'
			aria-label={lockedNote}
			title={lockedNote}
		>
			<IconLock size={20} />
		</span>
	);
}

/** Таблица участников для окна от 768 px. */
export function MembersTable({
	members,
	meId,
	busyId,
	onAction,
}: MembersViewProps) {
	return (
		<Table
			className={classes.table}
			verticalSpacing='sm'
			horizontalSpacing='md'
		>
			<Table.Thead>
				<Table.Tr>
					<Table.Th>Аккаунт Aéza</Table.Th>
					<Table.Th>Роль</Table.Th>
					<Table.Th>Доступ</Table.Th>
					<Table.Th>Последняя активность</Table.Th>
					<Table.Th>Добавлен</Table.Th>
					<Table.Th className={classes.actions}>
						<VisuallyHidden>Действия</VisuallyHidden>
					</Table.Th>
				</Table.Tr>
			</Table.Thead>
			<Table.Tbody>
				{members.map((member) => {
					const note = !member.editable
						? lockedNote
						: member.role === 'integration'
							? 'Работает через API по\u00a0ключу, в\u00a0панель не\u00a0входит'
							: null;

					return (
						<Table.Tr key={member.id}>
							<Table.Td>
								<div className={classes.who}>
									<Email member={member} meId={meId} />
									{note && (
										<span className={classes.moment} data-none>
											{note}
										</span>
									)}
								</div>
							</Table.Td>
							<Table.Td>
								<RoleBadge role={member.role} />
							</Table.Td>
							<Table.Td>
								<span
									className={classes.access}
									data-off={!member.enabled || undefined}
								>
									{member.enabled ? 'Включён' : 'Отключён'}
								</span>
							</Table.Td>
							<Table.Td>
								<span
									className={classes.moment}
									data-none={!member.lastSeenAt || undefined}
								>
									{activityLabel(member)}
								</span>
							</Table.Td>
							<Table.Td>
								<span className={classes.moment}>
									{formatMoment(member.createdAt)}
								</span>
							</Table.Td>
							<Table.Td className={classes.actions}>
								{member.editable ? (
									<MemberMenu
										member={member}
										busy={busyId === member.id}
										onAction={onAction}
									/>
								) : (
									<Locked />
								)}
							</Table.Td>
						</Table.Tr>
					);
				})}
			</Table.Tbody>
		</Table>
	);
}

/** Список участников для телефона: email, роль и активность, действия в меню. */
export function MembersList({
	members,
	meId,
	busyId,
	onAction,
}: MembersViewProps) {
	return (
		<ul className={classes.list}>
			{members.map((member) => (
				<li key={member.id} className={classes.item}>
					<div className={classes.itemText}>
						<Email member={member} meId={meId} />
						<span className={classes.itemMeta}>
							<RoleBadge role={member.role} />
							{!member.editable ? (
								<span>задан в&nbsp;настройках сервера</span>
							) : (
								<span>
									{member.lastSeenAt
										? `активность ${formatMomentTime(member.lastSeenAt)}`
										: activityLabel(member)}
								</span>
							)}
							{!member.enabled && (
								<span className={classes.itemOff}>доступ отключён</span>
							)}
						</span>
					</div>
					{member.editable ? (
						<MemberMenu
							member={member}
							busy={busyId === member.id}
							onAction={onAction}
						/>
					) : (
						<Locked />
					)}
				</li>
			))}
		</ul>
	);
}
