import {
	Button,
	Group,
	Loader,
	Skeleton,
	Table,
	Text,
	Title,
	VisuallyHidden,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
	deleteGroupChatMutation,
	type Department,
	departmentsOptions,
	getApiErrorCode,
	getApiErrorMessage,
	type GroupChat,
	listGroupChatsQueryKey,
	updateGroupChatMutation,
} from '@shared/api';
import { formatMoment } from '@shared/lib/dates';
import { IconPlus } from '@shared/ui/icons';
import { Island } from '@shared/ui/island';

import { chatLabel, chatScopeLabel } from '../lib/wording';
import { useGroupLink } from '../model/links';
import { linkFailure } from '../model/telegram';
import { DisconnectDialog } from './confirm-dialogs';
import { GroupLinkSteps } from './group-link-steps';
import { FlowNotice, LinkExpired } from './link-flow-view';
import classes from './notifications-page.module.css';
import { ScopeDialog } from './scope-dialog';
import { TelegramMark } from './telegram-mark';

interface ChatActions {
	onScope: (chat: GroupChat) => void;
	onDisconnect: (chat: GroupChat) => void;
	onReconnect: (chat: GroupChat) => void;
}

interface ChatsViewProps extends ChatActions {
	chats: GroupChat[];
	departments: Department[] | undefined;
}

function BlockedNote() {
	return (
		<span className={classes.chatBlocked}>
			<TelegramMark tone='blocked' size={16} />
			Бот удалён из&nbsp;группы
		</span>
	);
}

function ChatsTable({
	chats,
	departments,
	onScope,
	onDisconnect,
	onReconnect,
}: ChatsViewProps) {
	return (
		<div className={classes.tableBox}>
			<Table className={classes.table} verticalSpacing='sm'>
				<Table.Thead>
					<Table.Tr>
						<Table.Th className={classes.chatColumn}>Группа</Table.Th>
						<Table.Th>Отделы</Table.Th>
						<Table.Th>Подключена</Table.Th>
						<Table.Th>
							<VisuallyHidden>Действия</VisuallyHidden>
						</Table.Th>
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{chats.map((chat) => (
						<Table.Tr key={chat.id}>
							<Table.Td>
								<div className={classes.chatTitle}>
									<span className={classes.chatName}>{chatLabel(chat)}</span>
									{chat.blocked && (
										<>
											<BlockedNote />
											<Button
												variant='subtle'
												size='compact-sm'
												className={`${classes.reconnect} ${classes.accentAction}`}
												onClick={() => onReconnect(chat)}
											>
												Подключить снова
											</Button>
										</>
									)}
								</div>
							</Table.Td>
							<Table.Td className={classes.chatScope}>
								{chatScopeLabel(chat.departmentIds, departments)}
							</Table.Td>
							<Table.Td className={classes.chatDate}>
								{formatMoment(chat.linkedAt)}
							</Table.Td>
							<Table.Td>
								<Group gap={4} justify='flex-end' wrap='nowrap'>
									<Button
										variant='default'
										size='xs'
										aria-label={`Отделы группы «${chatLabel(chat)}»`}
										onClick={() => onScope(chat)}
									>
										Отделы
									</Button>
									<Button
										variant='subtle'
										color='gray'
										size='xs'
										aria-label={`Отключить группу «${chatLabel(chat)}»`}
										onClick={() => onDisconnect(chat)}
									>
										Отключить
									</Button>
								</Group>
							</Table.Td>
						</Table.Tr>
					))}
				</Table.Tbody>
			</Table>
		</div>
	);
}

function ChatsCards({
	chats,
	departments,
	onScope,
	onDisconnect,
	onReconnect,
}: ChatsViewProps) {
	return (
		<ul className={classes.cards}>
			{chats.map((chat) => (
				<li key={chat.id} className={classes.card}>
					<div className={classes.accountText}>
						<span className={classes.chatName}>{chatLabel(chat)}</span>
						{chat.blocked && <BlockedNote />}
						<Text size='sm' c='dimmed'>
							{chatScopeLabel(chat.departmentIds, departments)}
						</Text>
						<Text size='xs' c='dimmed'>
							Подключена{' '}
							<span className={classes.time}>
								{formatMoment(chat.linkedAt)}
							</span>
						</Text>
					</div>
					<Group gap={6}>
						{chat.blocked && (
							<Button variant='light' onClick={() => onReconnect(chat)}>
								Подключить снова
							</Button>
						)}
						<Button
							variant='default'
							aria-label={`Отделы группы «${chatLabel(chat)}»`}
							onClick={() => onScope(chat)}
						>
							Отделы
						</Button>
						<Button
							variant='subtle'
							color='gray'
							aria-label={`Отключить группу «${chatLabel(chat)}»`}
							onClick={() => onDisconnect(chat)}
						>
							Отключить
						</Button>
					</Group>
				</li>
			))}
		</ul>
	);
}

function chatActionError(error: unknown) {
	return getApiErrorCode(error) === 'not_found'
		? 'Группа уже отключена.'
		: getApiErrorMessage(error);
}

type ChatDialog = { kind: 'scope' | 'disconnect'; chat: GroupChat };

/** Остров администратора «Групповые чаты»: подключение групп по ссылке, их отделы и отключение. */
export function GroupChats({
	botConfigured,
	phone,
}: {
	/** Без бота подключить группу нельзя. */
	botConfigured: boolean;
	phone: boolean;
}) {
	const queryClient = useQueryClient();
	const flow = useGroupLink();
	const { result } = flow;
	const departments = useQuery(departmentsOptions());
	const [reconnecting, setReconnecting] = useState<GroupChat | null>(null);
	const [dialog, setDialog] = useState<ChatDialog | null>(null);
	const [opened, setOpened] = useState(false);

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: listGroupChatsQueryKey() });
	const onError = (error: unknown) =>
		getApiErrorCode(error) === 'not_found' && refresh();
	const update = useMutation({
		...updateGroupChatMutation(),
		onSuccess: async () => {
			await refresh();
			setOpened(false);
		},
		onError,
	});
	const remove = useMutation({
		...deleteGroupChatMutation(),
		onSuccess: async () => {
			await refresh();
			setOpened(false);
		},
		onError,
	});

	const open = (kind: ChatDialog['kind'], chat: GroupChat) => {
		update.reset();
		remove.reset();
		setDialog({ kind, chat });
		setOpened(true);
	};
	const connect = (chat: GroupChat | null) => {
		setReconnecting(chat);
		flow.request();
	};

	const failure = flow.error ? linkFailure(flow.error) : null;
	const failureNotice =
		failure &&
		(failure.kind === 'not_configured' ? (
			<FlowNotice title='Telegram-бот не&nbsp;настроен на&nbsp;сервере'>
				Подключить группу пока нельзя.
			</FlowNotice>
		) : (
			<FlowNotice
				title={
					failure.kind === 'unavailable'
						? 'Telegram не\u00a0отвечает'
						: 'Не удалось получить код'
				}
			>
				{failure.kind === 'unavailable'
					? 'Не получилось создать код для\u00a0бота. Попробуйте ещё раз через минуту.'
					: failure.message}
			</FlowNotice>
		));
	const chats = result.data?.items ?? [];
	const actions: ChatActions = {
		onScope: (chat) => open('scope', chat),
		onDisconnect: (chat) => open('disconnect', chat),
		onReconnect: connect,
	};

	const waitingPanel = () => {
		if (!flow.link) {
			return failureNotice;
		}

		if (flow.expired) {
			return (
				<div className={classes.groupFlow}>
					{failureNotice}
					<LinkExpired
						code
						renewing={flow.requesting}
						onRenew={flow.request}
						onCancel={flow.cancel}
					/>
				</div>
			);
		}

		return (
			<div className={classes.groupFlow}>
				<span className={classes.status} aria-live='polite'>
					<Loader size={16} />
					<span className={classes.statusStrong}>
						{reconnecting
							? 'Ждём, пока бота вернут в\u00a0группу'
							: 'Ждём подключения группы или темы'}
					</span>
				</span>
				<GroupLinkSteps
					link={flow.link}
					reconnecting={reconnecting && chatLabel(reconnecting)}
					showQr={!phone}
					renewing={flow.requesting}
					error={failureNotice}
					onRenew={flow.request}
					onCancel={flow.cancel}
				/>
			</div>
		);
	};

	const list = () => {
		if (result.isPending) {
			return (
				<>
					<Skeleton height={20} width='60%' />
					<Skeleton height={20} width='45%' />
				</>
			);
		}

		if (result.isError && !result.data) {
			return (
				<div className={classes.loadError} role='alert'>
					<TelegramMark tone='blocked' size={22} />
					<div className={classes.accountText}>
						<Text fw={700} size='lg'>
							Не удалось загрузить групповые чаты
						</Text>
						<Text c='dimmed'>
							Проверьте подключение и&nbsp;попробуйте ещё раз.
						</Text>
						<Button
							variant='default'
							mt={6}
							loading={result.isFetching}
							onClick={() => void result.refetch()}
						>
							Повторить
						</Button>
					</div>
				</div>
			);
		}

		if (chats.length === 0) {
			return <Text className={classes.empty}>Групповых чатов пока нет.</Text>;
		}

		return phone ? (
			<ChatsCards
				chats={chats}
				departments={departments.data?.items}
				{...actions}
			/>
		) : (
			<ChatsTable
				chats={chats}
				departments={departments.data?.items}
				{...actions}
			/>
		);
	};

	const target = dialog?.chat;

	return (
		<Island aria-labelledby='group-chats' className={classes.groups}>
			<div className={classes.groupsHead}>
				<div className={classes.groupsHeading}>
					<Title order={2} id='group-chats' className={classes.islandTitle}>
						Групповые чаты
					</Title>
					<Text size='sm' c='dimmed'>
						Группы Telegram, куда бот пишет о&nbsp;платежах. Общий чат
						настраивается на&nbsp;сервере и&nbsp;здесь не&nbsp;показан.
					</Text>
				</div>
				{!flow.link && botConfigured && !result.isError && (
					<Button
						variant='light'
						leftSection={<IconPlus size={18} />}
						loading={flow.requesting}
						onClick={() => connect(null)}
					>
						Подключить группу
					</Button>
				)}
			</div>
			{waitingPanel()}
			{list()}
			<ScopeDialog
				opened={opened && dialog?.kind === 'scope'}
				subject={`в\u00a0группу «${target ? chatLabel(target) : ''}»`}
				targetKey={target?.id ?? ''}
				departmentIds={target?.departmentIds ?? null}
				pending={update.isPending}
				error={update.error ? chatActionError(update.error) : null}
				onSave={(departmentIds) =>
					target &&
					update.mutate({
						path: { chat_id: target.id },
						body: { departmentIds },
					})
				}
				onClose={() => setOpened(false)}
			/>
			<DisconnectDialog
				title={target ? chatLabel(target) : ''}
				opened={opened && dialog?.kind === 'disconnect'}
				pending={remove.isPending}
				error={remove.error ? chatActionError(remove.error) : null}
				onConfirm={() =>
					target && remove.mutate({ path: { chat_id: target.id } })
				}
				onClose={() => setOpened(false)}
			/>
		</Island>
	);
}
