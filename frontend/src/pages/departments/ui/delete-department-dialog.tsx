import { Modal, Stack } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';

import {
	type Department,
	deleteDepartmentMutation,
	listGroupChatsOptions,
	listRecurringPaymentsOptions,
} from '@shared/api';
import {
	DialogActions,
	DialogError,
	DialogInfo,
	DialogSubject,
	DialogText,
} from '@shared/ui/dialog';

import { activePaymentsLabel, remainVerb } from '../lib/payments-count';
import {
	departmentActionError,
	isDepartmentGone,
	useRefreshDepartments,
} from '../model/departments';

// Сведения справочные: при ошибке этих запросов окно показывает только число платежей.
function useDepartmentReach(department: Department) {
	const payments = useQuery({
		...listRecurringPaymentsOptions({
			query: { departmentId: department.id, status: 'active', limit: 100 },
		}),
		enabled: department.paymentsCount > 0,
	});
	const chats = useQuery(listGroupChatsOptions({ query: { limit: 100 } }));

	return {
		paymentNames: payments.data?.items.map((payment) => payment.name) ?? [],
		chats: (chats.data?.items ?? []).filter((chat) =>
			chat.departmentIds?.includes(department.id)
		),
	};
}

function PaymentsLine({ count, names }: { count: number; names: string[] }) {
	if (count === 0) {
		return <DialogText>В&nbsp;отделе нет действующих платежей.</DialogText>;
	}

	const list = names.length > 0 ? `: ${names.join(', ')}` : '';

	return (
		<DialogText>
			{`${activePaymentsLabel(count)} ${remainVerb(count)} без отдела${list}.`}
		</DialogText>
	);
}

function DeleteForm({
	department,
	onClose,
}: {
	department: Department;
	onClose: () => void;
}) {
	const { paymentNames, chats } = useDepartmentReach(department);
	const refresh = useRefreshDepartments();
	const remove = useMutation({
		...deleteDepartmentMutation(),
		onSuccess: refresh,
		onError: (error) => isDepartmentGone(error) && refresh(),
	});

	const confirm = async () => {
		await remove.mutateAsync({ path: { department_id: department.id } });
		onClose();
	};

	return (
		<Stack gap='md'>
			<DialogSubject>{department.name}</DialogSubject>
			<PaymentsLine count={department.paymentsCount} names={paymentNames} />
			<DialogText quiet>
				Сами платежи, сроки и&nbsp;оплаты не&nbsp;изменятся.
			</DialogText>
			{chats.map((chat) => (
				<DialogInfo key={chat.id}>
					{chat.departmentIds?.length === 1
						? `Групповой чат «${chat.title}» получает напоминания только по\u00a0этому отделу. После удаления он начнёт получать их по\u00a0всем платежам.`
						: `Групповой чат «${chat.title}» перестанет получать напоминания по\u00a0этому отделу. По\u00a0остальным отделам всё останется как есть.`}
				</DialogInfo>
			))}
			<DialogText quiet>
				Личные напоминания, где выбран только этот отдел, тоже перейдут
				на&nbsp;все платежи.
			</DialogText>
			{remove.error && (
				<DialogError>{departmentActionError(remove.error)}</DialogError>
			)}
			<DialogActions
				confirmLabel='Удалить отдел'
				danger
				pending={remove.isPending}
				onCancel={onClose}
				onConfirm={() => void confirm().catch(() => {})}
			/>
		</Stack>
	);
}

/** Окно подтверждения удаления отдела: что станет с платежами и чатами. */
export function DeleteDepartmentDialog({
	department,
	opened,
	onClose,
}: {
	department: Department | null;
	opened: boolean;
	onClose: () => void;
}) {
	return (
		<Modal opened={opened} onClose={onClose} title='Удалить отдел?' size={440}>
			{department && <DeleteForm department={department} onClose={onClose} />}
		</Modal>
	);
}
