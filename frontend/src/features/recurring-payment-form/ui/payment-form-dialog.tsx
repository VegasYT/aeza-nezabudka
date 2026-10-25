import {
	Group,
	Modal,
	NumberInput,
	Select,
	Stack,
	Text,
	TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm, useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
	anchorNote,
	CURRENCY_NAMES,
	dayOf,
	lastDue,
	nextDuesHint,
	overdueDueDate,
	periodWord,
	type Schedule,
	useRefreshRecurring,
} from '@entities/recurring-payment';
import {
	createRecurringPaymentMutation,
	type Currency,
	departmentsOptions,
	getApiErrorCode,
	type Period,
	type RecurringPayment,
	settingsOptions,
	updateRecurringPaymentMutation,
} from '@shared/api';
import { formatDate } from '@shared/lib/dates';
import { fieldError } from '@shared/lib/form';
import { usePhone } from '@shared/lib/media';
import { CURRENCIES, currencySign, formatMoney } from '@shared/lib/money';
import {
	DialogActions,
	DialogError,
	DialogInfo,
	DialogSubject,
} from '@shared/ui/dialog';
import { IconCalendar } from '@shared/ui/icons';

import {
	amountMinorOf,
	changedFields,
	COUNT_MAX,
	createBody,
	CUSTOM,
	type FormValues,
	formSchema,
	initialValues,
	inRange,
	LIMIT_MAX,
	NAME_MAX,
	NO_DEPARTMENT,
	paymentActionError,
	PERIODS,
	PRESETS,
	presetOf,
	safeCount,
	serverFieldErrors,
} from '../model/payment-form';
import classes from './payment-form.module.css';
import { ReminderAlert } from './reminder-alert';

interface SaveDeps {
	create: ReturnType<typeof useCreatePayment>;
	update: ReturnType<typeof useUpdatePayment>;
	idempotency: { current: { body: string; key: string } | null };
}

function useCreatePayment() {
	return useMutation(createRecurringPaymentMutation());
}

function useUpdatePayment() {
	return useMutation(updateRecurringPaymentMutation());
}

/** Создаёт платёж или шлёт `PATCH` только с изменёнными полями. */
async function savePayment(
	payment: RecurringPayment | null,
	values: FormValues,
	{ create, update, idempotency }: SaveDeps
) {
	if (payment) {
		await update.mutateAsync({
			path: { payment_id: payment.id },
			body: changedFields(payment, values),
		});

		return;
	}

	const body = createBody(values);
	const serialized = JSON.stringify(body);

	// Повтор того же тела после обрыва связи идёт с тем же ключом: сервер не создаст второй платёж.
	if (idempotency.current?.body !== serialized) {
		idempotency.current = { body: serialized, key: crypto.randomUUID() };
	}

	await create.mutateAsync({
		body,
		headers: { 'Idempotency-Key': idempotency.current.key },
	});
}

/** Пояснение в форме изменения: какие периоды изменятся, а какие останутся. */
function EditScope({
	payment,
	today,
}: {
	payment: RecurringPayment;
	today: string;
}) {
	const overdueDate = overdueDueDate(payment, today);
	const kept =
		payment.overdueCount === 0
			? 'Оплаченные периоды останутся как были.'
			: overdueDate
				? `Оплаченные периоды и\u00a0просроченный ${formatDate(overdueDate)} останутся как были.`
				: 'Оплаченные и\u00a0просроченные периоды останутся как были.';

	return (
		<DialogInfo>
			<strong>
				{payment.nextDueDate
					? `Сумма, валюта, дата и\u00a0периодичность изменятся с\u00a0периода ${formatDate(payment.nextDueDate)}.`
					: 'Сумма, валюта, дата и\u00a0периодичность изменятся у\u00a0следующих периодов.'}
			</strong>{' '}
			{kept} Название и&nbsp;отдел поменяются и&nbsp;в&nbsp;истории.
		</DialogInfo>
	);
}

function PaymentForm({
	payment,
	onClose,
}: {
	/** Изменяемый платёж; без него форма создаёт новый. */
	payment: RecurringPayment | null;
	onClose: () => void;
}) {
	const { data: settings } = useSuspenseQuery(settingsOptions());
	const { today, reminderDaysBefore } = settings;
	const phone = usePhone();
	const departments = useQuery(departmentsOptions()).data?.items ?? [];
	const refresh = useRefreshRecurring();
	const create = useCreatePayment();
	const update = useUpdatePayment();
	const action = payment ? update : create;
	// Ошибки полей с сервера живут до следующей правки поля.
	const [serverErrors, setServerErrors] = useState<
		Partial<Record<keyof FormValues, string>>
	>({});
	const idempotency = useRef<{ body: string; key: string } | null>(null);
	// Своя периодичность держится, даже если её N и единица совпали с готовым вариантом.
	const [custom, setCustom] = useState(
		payment !== null && presetOf(payment.period, payment.periodCount) === null
	);

	const form = useForm({
		defaultValues: initialValues(payment),
		validators: { onSubmit: formSchema(payment) },
		onSubmit: ({ value }) =>
			savePayment(payment, value, { create, update, idempotency }).then(
				() => {
					void refresh();
					onClose();
				},
				(error: unknown) => {
					if (getApiErrorCode(error) === 'payment_stopped') {
						void refresh();
					}

					const fields = serverFieldErrors(error);

					if (Object.keys(fields).length > 0) {
						setServerErrors(fields);
						action.reset();
					}
				}
			),
	});

	const values = useStore(form.store, (state) => state.values);
	const changed = payment
		? Object.keys(changedFields(payment, values)).length > 0
		: true;
	const dateChanged = values.nextDueDate !== (payment?.nextDueDate ?? '');
	const schedule: Schedule | null = values.nextDueDate
		? {
				period: values.period,
				periodCount: safeCount(values.periodCount),
				// Без новой даты сервер продолжает расписание от прежнего якорного дня.
				anchorDay:
					payment && !dateChanged
						? payment.anchorDay
						: dayOf(values.nextDueDate),
			}
		: null;
	const note =
		payment && !dateChanged && schedule
			? anchorNote(schedule, payment.nextDueDate)
			: null;
	const preset = custom ? null : presetOf(values.period, values.periodCount);
	const validLimit = inRange(values.occurrenceLimit, LIMIT_MAX)
		? Number(values.occurrenceLimit)
		: null;
	// Сколько периодов уже создано, форма изменения не знает: последнюю дату считает только создание.
	const limitHint = payment
		? `Уже оплачено ${payment.paidOccurrences}`
		: schedule && validLimit
			? `Последний срок ${formatDate(lastDue(values.nextDueDate, schedule, validLimit))}`
			: undefined;
	const amountBefore = payment
		? formatMoney(payment.amountMinor, payment.currency)
		: null;

	const clearServerError = (name: keyof FormValues) =>
		setServerErrors((errors) => ({ ...errors, [name]: undefined }));

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<Stack gap='md'>
				{payment && <EditScope payment={payment} today={today} />}
				<div className={classes.formGrid}>
					<form.Field name='name'>
						{(field) => (
							<TextInput
								className={classes.wide}
								label='Название'
								placeholder='Например, аренда офиса'
								autoComplete='off'
								maxLength={NAME_MAX}
								data-autofocus
								value={field.state.value}
								onChange={(event) => {
									clearServerError('name');
									field.handleChange(event.target.value);
								}}
								onBlur={field.handleBlur}
								error={fieldError(field) ?? serverErrors.name}
							/>
						)}
					</form.Field>
					<form.Field name='amount'>
						{(field) => {
							const amountChanged =
								payment !== null &&
								amountMinorOf(field.state.value) !== payment.amountMinor;

							return (
								<TextInput
									label='Сумма'
									placeholder='0,00'
									inputMode='decimal'
									autoComplete='off'
									rightSection={currencySign(values.currency)}
									value={field.state.value}
									onChange={(event) => {
										clearServerError('amount');
										field.handleChange(event.target.value);
									}}
									onBlur={field.handleBlur}
									error={fieldError(field) ?? serverErrors.amount}
									description={
										amountChanged ? `Было ${amountBefore}` : undefined
									}
									inputWrapperOrder={['label', 'input', 'description', 'error']}
								/>
							);
						}}
					</form.Field>
					<form.Field name='currency'>
						{(field) => (
							<Select
								label='Валюта'
								allowDeselect={false}
								data={CURRENCIES.map((currency) => ({
									value: currency,
									label: CURRENCY_NAMES[currency],
								}))}
								value={field.state.value}
								onChange={(value) => {
									clearServerError('currency');
									field.handleChange((value ?? 'RUB') as Currency);
								}}
								error={serverErrors.currency}
							/>
						)}
					</form.Field>
					<form.Field name='nextDueDate'>
						{(field) => (
							<DatePickerInput
								label='Дата ближайшей оплаты'
								placeholder='ДД.ММ.ГГГГ'
								valueFormat='DD.MM.YYYY'
								minDate={today}
								rightSection={<IconCalendar size={18} />}
								rightSectionPointerEvents='none'
								value={field.state.value || null}
								onChange={(value) => {
									clearServerError('nextDueDate');
									field.handleChange(value ?? '');
								}}
								error={fieldError(field) ?? serverErrors.nextDueDate}
								description={
									schedule
										? (nextDuesHint(
												values.nextDueDate,
												schedule,
												payment ? null : validLimit
											) ?? undefined)
										: undefined
								}
								inputWrapperOrder={['label', 'input', 'description', 'error']}
							/>
						)}
					</form.Field>
					<Select
						label='Периодичность'
						allowDeselect={false}
						data={[
							...PRESETS,
							{ value: CUSTOM, label: 'Другая периодичность' },
						]}
						value={preset ?? CUSTOM}
						onChange={(value) => {
							if (!value || value === CUSTOM) {
								setCustom(true);

								return;
							}

							const [period, periodCount] = value.split(':');

							setCustom(false);
							form.setFieldValue('period', period as Period);
							form.setFieldValue('periodCount', Number(periodCount));
						}}
						error={serverErrors.period}
					/>
					{preset === null && (
						<Group className={classes.wide} gap='xs' align='flex-start'>
							<form.Field name='periodCount'>
								{(field) => (
									<NumberInput
										className={classes.count}
										label='Раз в'
										min={1}
										max={COUNT_MAX}
										allowDecimal={false}
										allowNegative={false}
										value={field.state.value}
										onChange={(value) => {
											clearServerError('periodCount');
											field.handleChange(value);
										}}
										onBlur={field.handleBlur}
										error={fieldError(field) ?? serverErrors.periodCount}
									/>
								)}
							</form.Field>
							<form.Field name='period'>
								{(field) => (
									<Select
										className={classes.unit}
										label='Единица'
										allowDeselect={false}
										data={PERIODS.map((period) => ({
											value: period,
											label: periodWord(period, safeCount(values.periodCount)),
										}))}
										value={field.state.value}
										onChange={(value) => {
											clearServerError('period');
											field.handleChange((value ?? 'month') as Period);
										}}
									/>
								)}
							</form.Field>
						</Group>
					)}
					{note && (
						<Text className={classes.wide} size='sm' c='dimmed'>
							{note}
						</Text>
					)}
					<ReminderAlert
						className={classes.wide}
						today={today}
						date={dateChanged ? values.nextDueDate : ''}
						reminderDaysBefore={reminderDaysBefore}
						after='сохранения'
					/>
					<form.Field name='occurrenceLimit'>
						{(field) => (
							<NumberInput
								label='Сколько раз оплатить'
								placeholder='Бессрочно'
								// Стрелки поля меньше пальца, на телефоне число набирают с клавиатуры.
								hideControls={phone}
								min={1}
								max={LIMIT_MAX}
								allowDecimal={false}
								allowNegative={false}
								value={field.state.value}
								onChange={(value) => {
									clearServerError('occurrenceLimit');
									field.handleChange(value);
								}}
								onBlur={field.handleBlur}
								error={fieldError(field) ?? serverErrors.occurrenceLimit}
								description={limitHint}
								inputWrapperOrder={['label', 'input', 'description', 'error']}
							/>
						)}
					</form.Field>
					<form.Field name='departmentId'>
						{(field) => (
							<Select
								label='Отдел'
								allowDeselect={false}
								data={[
									{ value: NO_DEPARTMENT, label: 'Без отдела' },
									...departments.map(({ id, name }) => ({
										value: id,
										label: name,
									})),
								]}
								value={field.state.value}
								onChange={(value) => {
									clearServerError('departmentId');
									field.handleChange(value ?? NO_DEPARTMENT);
								}}
								error={serverErrors.departmentId}
							/>
						)}
					</form.Field>
				</div>
				{action.error && (
					<DialogError>{paymentActionError(action.error)}</DialogError>
				)}
				<DialogActions
					confirmLabel={payment ? 'Сохранить' : 'Добавить платёж'}
					pending={action.isPending}
					disabled={!changed}
					onCancel={onClose}
				/>
			</Stack>
		</form>
	);
}

/** Окно нового платежа или изменения существующего; на телефоне во весь экран. */
export function PaymentFormDialog({
	payment,
	opened,
	onClose,
}: {
	payment: RecurringPayment | null;
	opened: boolean;
	onClose: () => void;
}) {
	const phone = usePhone();

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title={payment ? 'Изменить платёж' : 'Новый платёж'}
			size={560}
			fullScreen={phone}
		>
			{payment && <DialogSubject>{payment.name}</DialogSubject>}
			<PaymentForm
				key={payment?.id ?? 'new'}
				payment={payment}
				onClose={onClose}
			/>
		</Modal>
	);
}
