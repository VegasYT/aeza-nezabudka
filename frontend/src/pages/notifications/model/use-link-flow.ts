import {
	type QueryKey,
	useMutation,
	useQuery,
	type UseQueryOptions,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { TelegramLink } from '@shared/api';
import { useLiveConnected } from '@shared/live';

import { POLL_INTERVAL } from './telegram';

interface Attempt<TLink, TSince> {
	link: TLink;
	since: TSince;
}

interface LinkFlowOptions<
	TData,
	TError,
	TKey extends QueryKey,
	TLink extends TelegramLink,
	TSince,
> {
	/** Запрос, который покажет результат привязки: его перечитываем, пока ссылка действует. */
	query: UseQueryOptions<TData, TError, TData, TKey>;
	/** Выдаёт одноразовую ссылку на бота. */
	create: () => Promise<TLink>;
	/** Снимок данных в момент запроса ссылки: от него считается, что привязка состоялась. */
	snapshot: (data: TData | undefined) => TSince;
	/** Привязка состоялась: данные запроса изменились относительно снимка. */
	isDone: (data: TData, since: TSince) => boolean;
}

/**
 * Ссылка на бота и ожидание привязки: личный Telegram и групповые чаты. Пока ссылка действует,
 * запрос перечитывается по событию потока, а без потока - опросом; ожидание заканчивается
 * по `isDone` или когда ссылка устарела.
 */
export function useLinkFlow<
	TData,
	TError,
	TKey extends QueryKey,
	TLink extends TelegramLink,
	TSince,
>({
	query,
	create,
	snapshot,
	isDone,
}: LinkFlowOptions<TData, TError, TKey, TLink, TSince>) {
	const [attempt, setAttempt] = useState<Attempt<TLink, TSince> | null>(null);
	const [expiredLink, setExpiredLink] = useState<TLink | null>(null);
	const mutation = useMutation({ mutationFn: create });
	const live = useLiveConnected();
	const expired = attempt !== null && attempt.link === expiredLink;
	// Привязку приносит событие потока; опрос нужен, только пока потока нет.
	const polling = attempt !== null && !expired && !live;
	const result = useQuery({
		...query,
		refetchInterval: polling ? POLL_INTERVAL : false,
	});
	const done =
		attempt !== null &&
		result.data !== undefined &&
		isDone(result.data, attempt.since);

	// Привязка пришла: ожидание закрывается в этом же кадре, без эффекта.
	if (done) {
		setAttempt(null);
	}

	const link = done ? null : (attempt?.link ?? null);

	useEffect(() => {
		if (!link) {
			return;
		}

		const timer = setTimeout(
			() => setExpiredLink(link),
			Date.parse(link.expiresAt) - Date.now()
		);

		return () => clearTimeout(timer);
	}, [link]);

	return {
		result,
		/** Действующая или устаревшая ссылка, пока идёт подключение. */
		link,
		expired: link !== null && expired,
		requesting: mutation.isPending,
		error: mutation.error,
		/** Запрашивает новую ссылку; прежняя перестаёт действовать на сервере. */
		request: () => {
			const since = snapshot(result.data);

			mutation.mutate(undefined, {
				onSuccess: (created) => setAttempt({ link: created, since }),
			});
		},
		cancel: () => {
			setAttempt(null);
			mutation.reset();
		},
	};
}
