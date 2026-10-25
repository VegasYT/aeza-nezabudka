import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
	attachReceiptMutation,
	deleteReceiptMutation,
	getApiErrorCode,
	getApiErrorMessage,
	getApiFieldErrors,
	getApiStatus,
	type PaymentOccurrence,
} from '@shared/api';

import { invalidatePayments } from './payments-queries';

/** Какие файлы предлагать в выборе файла. */
export const RECEIPT_ACCEPT =
	'.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

const RECEIPT_TYPES = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
];
const RECEIPT_EXTENSIONS = /\.(pdf|jpe?g|png|webp)$/i;
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Что принимает сервер: для подписи поля и ошибки. */
export const RECEIPT_RULE = 'PDF, JPEG, PNG или WebP до\u00a010\u00a0МБ';

/** Почему файл не подходит, или `null`. Тип по содержимому окончательно проверяет сервер. */
export function receiptFileError(file: File) {
	const known =
		RECEIPT_TYPES.includes(file.type) || RECEIPT_EXTENSIONS.test(file.name);

	return known && file.size <= RECEIPT_MAX_BYTES
		? null
		: `Нужен файл ${RECEIPT_RULE}`;
}

/** Текст ошибки загрузки или удаления чека. */
export function receiptError(error: unknown) {
	// Слишком большой файл отсекает прокси, его ответ не в формате API.
	if (getApiStatus(error) === 413) {
		return 'Файл больше 10\u00a0МБ.';
	}

	switch (getApiErrorCode(error)) {
		case 'receipts_disabled':
			return 'Чеки на\u00a0сервере выключены.';

		case 'storage_unavailable':
			return 'Хранилище чеков сейчас недоступно. Попробуйте ещё раз позже.';

		case 'occurrence_not_paid':
			return 'Период уже не\u00a0оплачен: чек можно приложить только к\u00a0оплате.';

		default:
			return getApiFieldErrors(error).file ?? getApiErrorMessage(error);
	}
}

/** Загрузка и удаление чека периода; после записи перечитываются периоды и открытый чек. */
export function useReceiptActions() {
	const queryClient = useQueryClient();
	const refresh = () => invalidatePayments(queryClient);
	const attach = useMutation({
		...attachReceiptMutation(),
		onSuccess: refresh,
	});
	const remove = useMutation({
		...deleteReceiptMutation(),
		onSuccess: refresh,
	});

	return {
		/** Прикладывает файл; новый заменяет прежний. Возвращает период с чеком, ошибку отдаёт вызывающему. */
		attach: (occurrence: PaymentOccurrence, file: File) =>
			attach.mutateAsync({
				path: { occurrence_id: occurrence.id },
				body: { file },
			}),
		remove: (occurrence: PaymentOccurrence) =>
			remove.mutateAsync({ path: { occurrence_id: occurrence.id } }),
		attaching: attach.isPending,
		removing: remove.isPending,
	};
}
