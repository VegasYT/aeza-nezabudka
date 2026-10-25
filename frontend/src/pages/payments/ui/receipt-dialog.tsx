import {
	Anchor,
	Button,
	FileButton,
	Group,
	Modal,
	Skeleton,
	Stack,
	Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import {
	getReceiptOptions,
	type PaymentOccurrence,
	type Receipt,
} from '@shared/api';
import { formatDate, formatMoment } from '@shared/lib/dates';
import { formatFileSize } from '@shared/lib/files';
import { usePhone } from '@shared/lib/media';
import { DialogError, DialogText } from '@shared/ui/dialog';
import { IconExternalLink, IconPaperclip, IconTrash } from '@shared/ui/icons';

import {
	RECEIPT_ACCEPT,
	RECEIPT_RULE,
	receiptError,
	receiptFileError,
	useReceiptActions,
} from '../model/receipts';
import classes from './payments-page.module.css';

/** `blob:`-ссылка на скачанный файл: живёт, пока файл на экране, потом отзывается. */
function useObjectUrl(blob: Blob | undefined) {
	const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

	useEffect(
		() => () => {
			if (url) {
				URL.revokeObjectURL(url);
			}
		},
		[url]
	);

	return url;
}

function ReceiptFile({
	occurrence,
	receipt,
}: {
	occurrence: PaymentOccurrence;
	receipt: Receipt;
}) {
	// Файл требует токена: прямая ссылка без него не откроется, поэтому качаем запросом.
	const file = useQuery(
		getReceiptOptions({ path: { occurrence_id: occurrence.id } })
	);
	const url = useObjectUrl(file.data);
	const image = receipt.contentType.startsWith('image/');

	if (file.isError) {
		return (
			<Group gap='sm'>
				<Text size='sm' c='dimmed'>
					Не&nbsp;удалось загрузить файл чека.
				</Text>
				<Button variant='default' onClick={() => void file.refetch()}>
					Повторить
				</Button>
			</Group>
		);
	}

	if (!url) {
		return <Skeleton height={image ? 240 : 44} radius='md' />;
	}

	return (
		<>
			{image ? (
				<img
					src={url}
					alt={`Чек ${receipt.fileName}`}
					className={classes.receiptImage}
				/>
			) : (
				// Вкладку открывает само нажатие: открытую после ожидания запроса браузер заблокирует.
				<Button
					variant='default'
					leftSection={<IconExternalLink size={18} />}
					onClick={() => window.open(url, '_blank', 'noopener')}
				>
					Открыть PDF
				</Button>
			)}
			<Anchor
				href={url}
				download={receipt.fileName}
				size='sm'
				className={classes.receiptLink}
			>
				Скачать {receipt.fileName}
			</Anchor>
		</>
	);
}

function ReceiptBody({
	occurrence,
	onChange,
	onClose,
}: {
	occurrence: PaymentOccurrence;
	/** Чек загружен или заменён: период с новым чеком. */
	onChange: (occurrence: PaymentOccurrence) => void;
	onClose: () => void;
}) {
	const actions = useReceiptActions();
	const [error, setError] = useState<string | null>(null);
	const [confirming, setConfirming] = useState(false);
	const { receipt } = occurrence;
	const name = occurrence.recurringPayment.name;

	const upload = (file: File | null) => {
		if (!file) {
			return;
		}

		const invalid = receiptFileError(file);

		setError(invalid);

		if (invalid) {
			return;
		}

		actions.attach(occurrence, file).then(
			(updated) => {
				onChange(updated);
				notifications.show({
					title: receipt ? 'Чек заменён' : 'Чек приложен',
					message: name,
				});
			},
			(attachError: unknown) => setError(receiptError(attachError))
		);
	};

	const remove = () =>
		actions.remove(occurrence).then(
			() => {
				notifications.show({ title: 'Чек удалён', message: name });
				onClose();
			},
			(removeError: unknown) => {
				setConfirming(false);
				setError(receiptError(removeError));
			}
		);

	const picker = (label: string, variant: 'filled' | 'default') => (
		<FileButton accept={RECEIPT_ACCEPT} onChange={upload}>
			{(props) => (
				<Button
					{...props}
					variant={variant}
					leftSection={<IconPaperclip size={18} />}
					loading={actions.attaching}
				>
					{label}
				</Button>
			)}
		</FileButton>
	);

	return (
		<Stack gap='md'>
			<Text size='sm' c='dimmed'>
				{name}, срок {formatDate(occurrence.dueDate)}
			</Text>
			{receipt ? (
				<>
					<div className={classes.receiptMeta}>
						<span className={classes.name}>{receipt.fileName}</span>
						<Text size='sm' c='dimmed'>
							{formatFileSize(receipt.size)} · загружен{' '}
							{formatMoment(receipt.uploadedAt)}, {receipt.uploadedByLogin}
						</Text>
					</div>
					<ReceiptFile
						key={receipt.uploadedAt}
						occurrence={occurrence}
						receipt={receipt}
					/>
				</>
			) : (
				<DialogText quiet>
					Чек ещё не&nbsp;приложен. Подойдёт {RECEIPT_RULE}.
				</DialogText>
			)}
			{error && <DialogError>{error}</DialogError>}
			{confirming ? (
				<Stack gap='xs'>
					<DialogText>
						Удалить чек «{receipt?.fileName}»? Оплата останется отмеченной.
					</DialogText>
					<Group justify='flex-end' gap='xs'>
						<Button
							variant='subtle'
							color='gray'
							onClick={() => setConfirming(false)}
						>
							Не&nbsp;удалять
						</Button>
						<Button color='red' loading={actions.removing} onClick={remove}>
							Удалить чек
						</Button>
					</Group>
				</Stack>
			) : (
				<Group justify='flex-end' gap='xs'>
					{receipt ? (
						<>
							<Button
								variant='subtle'
								color='red'
								leftSection={<IconTrash size={18} />}
								onClick={() => setConfirming(true)}
							>
								Удалить
							</Button>
							{picker('Заменить', 'default')}
						</>
					) : (
						picker('Выбрать файл', 'filled')
					)}
				</Group>
			)}
		</Stack>
	);
}

/** Окно чека периода: просмотр, скачивание, замена и удаление; без чека - выбор файла. */
export function ReceiptDialog({
	occurrence,
	onChange,
	onClose,
}: {
	occurrence: PaymentOccurrence | null;
	onChange: (occurrence: PaymentOccurrence) => void;
	onClose: () => void;
}) {
	const phone = usePhone();

	return (
		<Modal
			opened={occurrence !== null}
			onClose={onClose}
			title={occurrence?.receipt ? 'Чек' : 'Приложить чек'}
			size={phone ? undefined : 560}
			fullScreen={phone}
		>
			{occurrence && (
				<ReceiptBody
					key={occurrence.id}
					occurrence={occurrence}
					onChange={onChange}
					onClose={onClose}
				/>
			)}
		</Modal>
	);
}
