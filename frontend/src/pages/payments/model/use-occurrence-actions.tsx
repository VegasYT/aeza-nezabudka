import { Button, Group, Text } from '@mantine/core';
import { type NotificationData, notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
	getApiErrorMessage,
	type PaymentOccurrence,
	type PaymentOccurrenceUpdate,
	updatePaymentOccurrenceMutation,
} from '@shared/api';
import { formatDate } from '@shared/lib/dates';

import { invalidatePayments } from './payments-queries';

const TOAST_ID = 'payment-occurrence';

// Уведомление о периодах одно: новое заменяет прежнее (Mantine не показывает второе с тем же id).
function notify(notification: NotificationData) {
	notifications.hide(TOAST_ID);
	notifications.show({ ...notification, id: TOAST_ID });
}

function failure(error: unknown) {
	notify({
		color: 'red',
		title: 'Не удалось сохранить',
		message: getApiErrorMessage(
			error,
			'Проверьте подключение и\u00a0попробуйте ещё раз.'
		),
	});
}

/** Отметка, исправление и отмена оплаты периода; после записи перечитываются периоды и итоги. */
export function useOccurrenceActions() {
	const queryClient = useQueryClient();
	const mutation = useMutation({
		...updatePaymentOccurrenceMutation(),
		onSuccess: () => invalidatePayments(queryClient),
	});

	const save = (occurrence: PaymentOccurrence, body: PaymentOccurrenceUpdate) =>
		mutation.mutateAsync({
			path: { occurrence_id: occurrence.id },
			body,
		});

	const toast = (
		title: string,
		text: string,
		action: string,
		run: () => void
	) =>
		notify({
			title,
			message: (
				<Group gap='xs' wrap='nowrap' justify='space-between'>
					<Text size='sm' c='dimmed'>
						{text}
					</Text>
					<Button
						variant='subtle'
						size='compact-sm'
						onClick={() => {
							notifications.hide(TOAST_ID);
							run();
						}}
					>
						{action}
					</Button>
				</Group>
			),
		});

	/** Отмечает оплату датой `paidOn` (без неё - сегодня сервера). Ошибку отдаёт вызывающему. */
	const markPaid = async (occurrence: PaymentOccurrence, paidOn?: string) => {
		const saved = await save(occurrence, { paid: true, paidOn });

		toast(
			'Оплата отмечена',
			`${occurrence.recurringPayment.name}, ${formatDate(saved.paidOn ?? '')}`,
			'Отменить',
			() => void unmark(saved)
		);
	};

	const unmark = async (occurrence: PaymentOccurrence) => {
		const previous = occurrence.paidOn;

		try {
			await save(occurrence, { paid: false });
		} catch (error) {
			failure(error);

			return;
		}

		toast(
			'Оплата отменена',
			'Период снова ждёт оплаты.',
			'Вернуть',
			() => void markPaid(occurrence, previous ?? undefined).catch(failure)
		);
	};

	return {
		/** Период, запись которого идёт сейчас. */
		pendingId: mutation.isPending
			? mutation.variables.path.occurrence_id
			: null,
		markToday: (occurrence: PaymentOccurrence) =>
			markPaid(occurrence).catch(failure),
		markOn: markPaid,
		/** Исправляет дату оплаты; ошибку отдаёт вызывающему. */
		correctDate: async (occurrence: PaymentOccurrence, paidOn: string) => {
			await save(occurrence, { paid: true, paidOn });
			notify({
				title: 'Дата оплаты исправлена',
				message: `${occurrence.recurringPayment.name}, ${formatDate(paidOn)}`,
			});
		},
		unmark,
	};
}
