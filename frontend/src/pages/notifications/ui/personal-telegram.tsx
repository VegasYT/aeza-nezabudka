import { Button, Loader, Skeleton, Switch, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
	departmentsOptions,
	getApiErrorCode,
	getApiErrorMessage,
	getTelegramStatusQueryKey,
	type TelegramStatus,
	unlinkTelegramMutation,
	updateTelegramSettingsMutation,
} from '@shared/api';
import { capitalize } from '@shared/lib/text';
import { Island } from '@shared/ui/island';

import { personalScopeLabel, reminderTimes } from '../lib/wording';
import type { PersonalLink } from '../model/links';
import { linkFailure } from '../model/telegram';
import { UnlinkDialog } from './confirm-dialogs';
import { FlowNotice, LinkExpired, LinkSteps } from './link-flow-view';
import classes from './notifications-page.module.css';
import { ScopeDialog } from './scope-dialog';
import { TelegramMark } from './telegram-mark';

const TOAST_ID = 'telegram-settings';

function StatusLine({
	status,
	waiting,
}: {
	status: TelegramStatus;
	waiting: boolean;
}) {
	if (waiting) {
		return (
			<span className={classes.status}>
				<Loader size={16} />
				<span className={classes.statusStrong}>
					Ждём подтверждения из&nbsp;Telegram
				</span>
			</span>
		);
	}

	if (!status.linked) {
		return (
			<span className={classes.status}>
				<TelegramMark tone='off' />
				<span className={classes.statusQuiet}>Не подключён</span>
			</span>
		);
	}

	if (status.blocked) {
		return (
			<span className={classes.status}>
				<TelegramMark tone='blocked' />
				<span className={classes.statusAlarm}>Бот остановлен</span>
			</span>
		);
	}

	return status.personalEnabled ? (
		<span className={classes.status}>
			<TelegramMark tone='on' />
			<span className={classes.statusStrong}>Подключён</span>
		</span>
	) : (
		<span className={classes.status}>
			<TelegramMark tone='off' />
			<span className={classes.statusQuiet}>Личные напоминания выключены</span>
		</span>
	);
}

function Account({
	status,
	onUnlink,
}: {
	status: TelegramStatus;
	onUnlink: () => void;
}) {
	const username = status.telegramUsername
		? `@${status.telegramUsername}`
		: null;

	return (
		<div className={classes.account}>
			<div className={classes.accountText}>
				<Text size='xs' c='dimmed'>
					Аккаунт Telegram
				</Text>
				<Text fw={600} size='lg'>
					{status.telegramName ?? username ?? 'Без имени'}
				</Text>
				{status.telegramName && (
					<Text size='sm' c='dimmed'>
						{username ?? 'без @username'}
					</Text>
				)}
			</div>
			<Button variant='default' onClick={onUnlink}>
				Отвязать
			</Button>
		</div>
	);
}

interface PersonalTelegramProps {
	flow: PersonalLink;
	daysBefore: number;
	phone: boolean;
}

/** Остров «Личный Telegram»: подключение по ссылке на бота, личные напоминания, фильтр отделов. */
export function PersonalTelegram({
	flow,
	daysBefore,
	phone,
}: PersonalTelegramProps) {
	const queryClient = useQueryClient();
	const { result } = flow;
	const status = result.data;
	const [dialog, setDialog] = useState<'unlink' | 'scope' | null>(null);
	const departments = useQuery({
		...departmentsOptions(),
		enabled: Boolean(status?.linked && status.departmentIds),
	});

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: getTelegramStatusQueryKey() });
	// Отвязали в другой вкладке или командой /stop: показываем, как есть на сервере.
	const onGone = (error: unknown) =>
		getApiErrorCode(error) === 'telegram_not_linked' && refresh();
	const update = useMutation({
		...updateTelegramSettingsMutation(),
		onSuccess: (saved) =>
			queryClient.setQueryData(getTelegramStatusQueryKey(), saved),
	});
	const toggle = useMutation({
		...updateTelegramSettingsMutation(),
		onSuccess: (saved) =>
			queryClient.setQueryData(getTelegramStatusQueryKey(), saved),
		onError: (error) => {
			onGone(error);
			notifications.hide(TOAST_ID);
			notifications.show({
				id: TOAST_ID,
				color: 'red',
				title: 'Не удалось сохранить',
				message: getApiErrorMessage(error),
			});
		},
	});
	const unlink = useMutation({
		...unlinkTelegramMutation(),
		onSuccess: async () => {
			await refresh();
			setDialog(null);
		},
		onError: onGone,
	});

	if (result.isPending) {
		return (
			<Island aria-label='Личный Telegram' className={classes.island}>
				<Skeleton height={22} width='40%' />
				<Skeleton height={16} width='70%' />
				<Skeleton height={36} width={180} />
			</Island>
		);
	}

	if (!status) {
		return (
			<Island aria-label='Личный Telegram' className={classes.island}>
				<FlowNotice title='Не удалось загрузить настройки уведомлений'>
					Проверьте подключение и&nbsp;попробуйте ещё раз.
				</FlowNotice>
				<Button
					variant='default'
					loading={result.isFetching}
					onClick={() => void result.refetch()}
				>
					Повторить
				</Button>
			</Island>
		);
	}

	const failure = flow.error ? linkFailure(flow.error) : null;
	const botMissing =
		!status.botConfigured || failure?.kind === 'not_configured';
	const failureNotice = failure && failure.kind !== 'not_configured' && (
		<FlowNotice
			title={
				failure.kind === 'unavailable'
					? 'Telegram не\u00a0отвечает'
					: 'Не удалось получить ссылку'
			}
		>
			{failure.kind === 'unavailable'
				? 'Не получилось создать ссылку на\u00a0бота. Попробуйте ещё раз через минуту.'
				: failure.message}
		</FlowNotice>
	);
	const waiting = flow.link !== null && !flow.expired;
	// Пока запрос идёт, переключатель стоит в новом положении; ошибка вернёт данные сервера.
	const sending = toggle.isPending
		? toggle.variables.body.personalEnabled
		: null;
	const enabled =
		typeof sending === 'boolean' ? sending : status.personalEnabled;
	const times = reminderTimes(daysBefore);

	const content = () => {
		if (flow.link && !flow.expired) {
			return (
				<LinkSteps
					link={flow.link}
					open='Откройте ссылку на&nbsp;бота'
					steps={[
						{ title: 'Нажмите «Запустить» в\u00a0чате с\u00a0ботом' },
						{
							title: 'Вернитесь на\u00a0эту вкладку',
							hint: 'Подключение появится само, обновлять страницу не\u00a0нужно.',
						},
					]}
					qrLabel='QR-код ссылки на бота'
					showQr={!phone}
					renewing={flow.requesting}
					error={failureNotice}
					onRenew={flow.request}
					onCancel={flow.cancel}
				/>
			);
		}

		if (flow.link) {
			return (
				<>
					{failureNotice}
					<LinkExpired
						renewing={flow.requesting}
						onRenew={flow.request}
						onCancel={flow.cancel}
					/>
				</>
			);
		}

		if (status.linked && status.blocked) {
			return (
				<>
					<Account status={status} onUnlink={() => setDialog('unlink')} />
					<FlowNotice title='Вы остановили бота в&nbsp;Telegram'>
						Пока он остановлен, личные напоминания не&nbsp;приходят. Откройте
						бота, разблокируйте его и&nbsp;нажмите «Запустить»: подключение
						восстановится само.
					</FlowNotice>
					{failureNotice}
					<Button
						loading={flow.requesting}
						disabled={botMissing}
						onClick={flow.request}
					>
						Получить ссылку на&nbsp;бота
					</Button>
				</>
			);
		}

		if (status.linked) {
			return (
				<>
					<Account status={status} onUnlink={() => setDialog('unlink')} />
					<Switch
						size='md'
						checked={enabled}
						disabled={toggle.isPending}
						onChange={(event) =>
							toggle.mutate({
								body: { personalEnabled: event.currentTarget.checked },
							})
						}
						label='Присылать мне лично'
						// Пояснение Mantine кладёт внутрь подписи: без этого оно попало бы в имя переключателя.
						aria-label='Присылать мне лично'
						description={
							enabled
								? `${capitalize(times)}.`
								: 'Бот вам не\u00a0пишет, Telegram остаётся подключён.'
						}
						classNames={{ label: classes.switchLabel }}
					/>
					<div className={classes.scope}>
						<div className={classes.accountText}>
							<Text size='xs' c='dimmed'>
								Какие платежи присылать
							</Text>
							<Text fw={600}>
								{personalScopeLabel(
									status.departmentIds,
									departments.data?.items
								)}
							</Text>
							{status.departmentIds && (
								<Text size='xs' c='dimmed'>
									Платежи без отдела не&nbsp;приходят.
								</Text>
							)}
						</div>
						<Button
							variant='default'
							aria-label='Изменить, какие платежи присылать'
							onClick={() => {
								update.reset();
								setDialog('scope');
							}}
						>
							Изменить
						</Button>
					</div>
				</>
			);
		}

		if (botMissing) {
			return (
				<FlowNotice title='Telegram-бот не&nbsp;настроен на&nbsp;сервере'>
					Подключить личный Telegram пока нельзя. Обратитесь
					к&nbsp;администратору Незабудки.
				</FlowNotice>
			);
		}

		return (
			<>
				{failureNotice}
				<Button
					variant={failureNotice ? 'default' : 'filled'}
					loading={flow.requesting}
					onClick={flow.request}
				>
					{failureNotice ? 'Попробовать ещё раз' : 'Подключить Telegram'}
				</Button>
			</>
		);
	};

	return (
		<Island aria-labelledby='personal-telegram' className={classes.island}>
			<div className={classes.islandHead} aria-live='polite'>
				<Title order={2} id='personal-telegram' className={classes.islandTitle}>
					Личный Telegram
				</Title>
				<StatusLine status={status} waiting={waiting} />
			</div>
			{!status.linked && !flow.link && (
				<div className={classes.lead}>
					<Text c='dimmed'>
						Бот будет присылать вам лично напоминания о&nbsp;платежах: {times}.
					</Text>
					<Text c='dimmed' mt={6}>
						Из&nbsp;чата с&nbsp;ботом можно отмечать оплату.
					</Text>
				</div>
			)}
			{content()}
			<UnlinkDialog
				username={status.telegramUsername}
				opened={dialog === 'unlink'}
				pending={unlink.isPending}
				error={unlink.error ? getApiErrorMessage(unlink.error) : null}
				onConfirm={() => unlink.mutate({})}
				onClose={() => {
					unlink.reset();
					setDialog(null);
				}}
			/>
			<ScopeDialog
				opened={dialog === 'scope'}
				subject='вам лично в&nbsp;Telegram'
				targetKey='personal'
				departmentIds={status.departmentIds}
				pending={update.isPending}
				error={update.error ? getApiErrorMessage(update.error) : null}
				onSave={(departmentIds) =>
					update.mutate(
						{ body: { departmentIds } },
						{ onSuccess: () => setDialog(null), onError: onGone }
					)
				}
				onClose={() => setDialog(null)}
			/>
		</Island>
	);
}
