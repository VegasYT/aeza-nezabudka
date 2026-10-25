import { useDocumentVisibility } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent } from 'react';

import { invalidateOperations } from '@shared/api';
import { currentUserOptions, useSession } from '@shared/auth';
import { connectLiveEvents, type LiveChange } from '@shared/live';

const PAYMENTS = [
	'listRecurringPayments',
	'getRecurringPayment',
	'listPaymentOccurrences',
	'getPaymentOccurrence',
	'getPaymentsSummary',
	'getPaymentsForecast',
	'getReceipt',
	// Число платежей в отделе.
	'listDepartments',
];

/** Какие запросы перечитывает изменение: по первой части кода действия, `payment.created` - `payment`. */
const OPERATIONS: Partial<Record<string, string[]>> = {
	occurrence: PAYMENTS,
	payment: PAYMENTS,
	reminder: PAYMENTS,
	// Чек есть в периоде; открытое окно чека перечитает и сам файл.
	receipt: PAYMENTS,
	// Название отдела есть в платежах и периодах.
	department: PAYMENTS,
	member: ['listUsers'],
	auth: ['listUsers'],
	telegram: ['getTelegramStatus'],
	telegram_chat: ['listGroupChats'],
	// Общее окно напоминаний: от него зависит «скоро срок».
	settings: ['getSettings'],
};

// Журнал перечитывается по любому изменению: у каждого есть запись.
function refresh(queryClient: QueryClient, change: LiveChange, me?: string) {
	const [group = ''] = change.type.split('.');
	const aboutMe = change.entityType === 'member' && change.entityId === me;

	void invalidateOperations(queryClient, [
		...(OPERATIONS[group] ?? []),
		...(aboutMe ? ['getCurrentUser'] : []),
		'listAuditLog',
	]);
}

/** Держит поток событий, пока есть сессия и вкладку видно, и перечитывает данные по событиям. */
export function LiveUpdates() {
	const queryClient = useQueryClient();
	const signedIn = useSession() !== null;
	const visible = useDocumentVisibility() === 'visible';

	const onChange = useEffectEvent((change: LiveChange) => {
		// Профиль уже загрузил защищённый маршрут: своего запроса здесь не нужно.
		const user = queryClient.getQueryData(currentUserOptions().queryKey);

		refresh(queryClient, change, user?.id);

		if (
			change.type === 'occurrence.paid' &&
			change.actorLogin &&
			change.actorLogin !== user?.email
		) {
			notifications.show({
				title: 'Отмечена оплата',
				message: [change.entityName, change.actorLogin]
					.filter(Boolean)
					.join(', '),
			});
		}
	});
	const onResync = useEffectEvent(() => void queryClient.invalidateQueries());

	useEffect(() => {
		if (!signedIn || !visible) {
			return;
		}

		return connectLiveEvents({ onChange, onResync });
	}, [signedIn, visible]);

	return null;
}
