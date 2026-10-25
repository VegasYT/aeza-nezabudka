import { Modal } from '@mantine/core';

import type { PaymentOccurrence } from '@shared/api';
import { formatDate } from '@shared/lib/dates';
import { DialogActions, DialogText } from '@shared/ui/dialog';

/** Подтверждение отмены оплаты периода с чеком: сервер удалит чек вместе с оплатой. */
export function UnmarkDialog({
	occurrence,
	onClose,
	onConfirm,
}: {
	occurrence: PaymentOccurrence | null;
	onClose: () => void;
	onConfirm: (occurrence: PaymentOccurrence) => void;
}) {
	return (
		<Modal
			opened={occurrence !== null}
			onClose={onClose}
			title='Отменить оплату?'
			size={460}
		>
			{occurrence && (
				<>
					<DialogText>
						{occurrence.recurringPayment.name}, срок{' '}
						{formatDate(occurrence.dueDate)}. Период снова будет ждать оплаты.
					</DialogText>
					<DialogText>
						Чек «{occurrence.receipt?.fileName}» тоже будет удалён.
					</DialogText>
					<DialogActions
						danger
						confirmLabel='Отменить оплату'
						pending={false}
						onCancel={onClose}
						onConfirm={() => {
							onClose();
							onConfirm(occurrence);
						}}
					/>
				</>
			)}
		</Modal>
	);
}
