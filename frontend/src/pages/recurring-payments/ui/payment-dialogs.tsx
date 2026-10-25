import { useState } from 'react';

import { PaymentFormDialog } from '@features/recurring-payment-form';
import type { RecurringPayment } from '@shared/api';

import { ResumePaymentDialog } from './resume-payment-dialog';
import { StopPaymentDialog } from './stop-payment-dialog';

type DialogKind = 'create' | 'edit' | 'stop' | 'resume';

// Платёж окна остаётся в состоянии и после закрытия: окно гаснет, не теряя содержимого.
interface DialogState {
	kind: DialogKind;
	payment: RecurringPayment | null;
	opened: boolean;
}

/** Окна создания, изменения, прекращения и возобновления платежа: общие для списка и карточки. */
export function usePaymentDialogs() {
	const [dialog, setDialog] = useState<DialogState>({
		kind: 'create',
		payment: null,
		opened: false,
	});
	const close = () => setDialog((state) => ({ ...state, opened: false }));

	const element = (
		<>
			<PaymentFormDialog
				payment={dialog.kind === 'edit' ? dialog.payment : null}
				opened={
					dialog.opened && (dialog.kind === 'create' || dialog.kind === 'edit')
				}
				onClose={close}
			/>
			<StopPaymentDialog
				payment={dialog.kind === 'stop' ? dialog.payment : null}
				opened={dialog.opened && dialog.kind === 'stop'}
				onClose={close}
			/>
			<ResumePaymentDialog
				payment={dialog.kind === 'resume' ? dialog.payment : null}
				opened={dialog.opened && dialog.kind === 'resume'}
				onClose={close}
			/>
		</>
	);

	return {
		create: () => setDialog({ kind: 'create', payment: null, opened: true }),
		edit: (payment: RecurringPayment) =>
			setDialog({ kind: 'edit', payment, opened: true }),
		stop: (payment: RecurringPayment) =>
			setDialog({ kind: 'stop', payment, opened: true }),
		resume: (payment: RecurringPayment) =>
			setDialog({ kind: 'resume', payment, opened: true }),
		element,
	};
}
