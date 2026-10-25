import {
	isReminderWindow,
	periodLabel,
	REMINDER_MAX,
} from '@entities/recurring-payment';
import {
	getApiErrorCode,
	getApiErrorMessage,
	getApiFieldErrors,
	type Period,
	type RecurringPayment,
	type RecurringPaymentCreate,
	type RecurringPaymentUpdate,
} from '@shared/api';
import { CURRENCIES, formatAmount, parseAmount } from '@shared/lib/money';
import { capitalize } from '@shared/lib/text';
import { z } from 'zod';

export const NAME_MAX = 200;
export const NO_DEPARTMENT = 'none';
export const PERIODS: Period[] = ['day', 'week', 'month', 'year'];
export const COUNT_MAX = 366;
export const LIMIT_MAX = 1000;
export const CUSTOM = 'custom';

/** Готовые варианты периодичности от частых к редким; остальное - «Другая периодичность». */
export const PRESETS = (
	[
		['week', 1],
		['week', 2],
		['month', 1],
		['month', 3],
		['month', 6],
		['year', 1],
	] as const
).map(([period, count]) => ({
	value: `${period}:${count}`,
	label: capitalize(periodLabel(period, count)),
}));

/** Значение готового варианта для `period` и `count` или `null`, если такого варианта нет. */
export function presetOf(period: Period, count: number | string) {
	const value = `${period}:${count}`;

	return PRESETS.some((preset) => preset.value === value) ? value : null;
}

/** Целое число от 1 до `max`: так проверяются и периодичность, и число оплат. */
// Не сужает тип: схема Zod тогда сменила бы тип значений формы.
export function inRange(value: unknown, max: number) {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 1 &&
		value <= max
	);
}

/** N периодичности для подсказок, пока поле не заполнено правильно. */
export function safeCount(value: number | string) {
	return inRange(value, COUNT_MAX) ? Number(value) : 1;
}

const schema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Введите название')
		.max(NAME_MAX, `Не длиннее ${NAME_MAX}\u00a0символов`),
	amount: z.string().superRefine((value, context) => {
		const parsed = parseAmount(value);

		if ('error' in parsed) {
			context.addIssue({ code: 'custom', message: parsed.error });
		}
	}),
	currency: z.enum(CURRENCIES),
	nextDueDate: z.string().min(1, 'Выберите дату ближайшей оплаты'),
	period: z.enum(PERIODS),
	periodCount: z
		.union([z.number(), z.string()])
		.refine(
			(value) => inRange(value, COUNT_MAX),
			`Число от\u00a01 до\u00a0${COUNT_MAX}`
		),
	// Пустое поле - бессрочный платёж.
	occurrenceLimit: z
		.union([z.number(), z.string()])
		.refine(
			(value) => value === '' || inRange(value, LIMIT_MAX),
			`Число от\u00a01 до\u00a0${LIMIT_MAX} или пусто`
		),
	// Пустое поле - общее окно напоминаний.
	reminderDaysBefore: z
		.union([z.number(), z.string()])
		.refine(
			(value) => value === '' || isReminderWindow(value),
			`Число от\u00a00 до\u00a0${REMINDER_MAX} или пусто`
		),
	departmentId: z.string(),
});

export type FormValues = z.infer<typeof schema>;

/** Проверка формы: у изменяемого платежа число оплат не меньше уже оплаченных и просроченных. */
export function formSchema(payment: RecurringPayment | null) {
	const minimum = payment ? payment.paidOccurrences + payment.overdueCount : 0;

	return schema.superRefine(({ occurrenceLimit }, context) => {
		if (typeof occurrenceLimit === 'number' && occurrenceLimit < minimum) {
			context.addIssue({
				code: 'custom',
				path: ['occurrenceLimit'],
				message: `Не меньше ${minimum}: столько периодов уже оплачено или просрочено`,
			});
		}
	});
}

/** Значения формы для нового платежа или для изменения существующего. */
export function initialValues(payment: RecurringPayment | null): FormValues {
	return {
		name: payment?.name ?? '',
		amount: payment ? formatAmount(payment.amountMinor) : '',
		currency: payment?.currency ?? 'RUB',
		nextDueDate: payment?.nextDueDate ?? '',
		period: payment?.period ?? 'month',
		periodCount: payment?.periodCount ?? 1,
		occurrenceLimit: payment?.occurrenceLimit ?? '',
		reminderDaysBefore: payment?.reminderDaysBefore ?? '',
		departmentId: payment?.department?.id ?? NO_DEPARTMENT,
	};
}

/** Сумма в минимальных единицах или `null`, если в поле не сумма. */
export function amountMinorOf(text: string) {
	const parsed = parseAmount(text);

	return 'amountMinor' in parsed ? parsed.amountMinor : null;
}

/** Тело `POST`: значения формы в виде API. Пустое число оплат - `null`, бессрочно; пустое окно - `null`, общее. */
export function createBody(values: FormValues): RecurringPaymentCreate {
	return {
		name: values.name.trim(),
		amountMinor: amountMinorOf(values.amount) ?? 0,
		currency: values.currency,
		nextDueDate: values.nextDueDate,
		period: values.period,
		periodCount: Number(values.periodCount),
		occurrenceLimit:
			values.occurrenceLimit === '' ? null : Number(values.occurrenceLimit),
		reminderDaysBefore:
			values.reminderDaysBefore === ''
				? null
				: Number(values.reminderDaysBefore),
		departmentId:
			values.departmentId === NO_DEPARTMENT ? null : values.departmentId,
	};
}

/** Тело `PATCH`: только поля, которые отличаются от платежа. */
export function changedFields(
	payment: RecurringPayment,
	values: FormValues
): RecurringPaymentUpdate {
	const next = createBody(values);
	const changes: RecurringPaymentUpdate = {};

	if (next.name !== payment.name) {
		changes.name = next.name;
	}

	// Сумма, которую не удалось разобрать, не уходит: форма покажет ошибку поля.
	if (
		amountMinorOf(values.amount) !== null &&
		next.amountMinor !== payment.amountMinor
	) {
		changes.amountMinor = next.amountMinor;
	}

	if (next.currency !== payment.currency) {
		changes.currency = next.currency;
	}

	if (next.nextDueDate && next.nextDueDate !== payment.nextDueDate) {
		changes.nextDueDate = next.nextDueDate;
	}

	if (next.period !== payment.period) {
		changes.period = next.period;
	}

	if (next.periodCount !== payment.periodCount) {
		changes.periodCount = next.periodCount;
	}

	if (next.occurrenceLimit !== payment.occurrenceLimit) {
		changes.occurrenceLimit = next.occurrenceLimit;
	}

	if (next.reminderDaysBefore !== payment.reminderDaysBefore) {
		changes.reminderDaysBefore = next.reminderDaysBefore;
	}

	if (next.departmentId !== (payment.department?.id ?? null)) {
		changes.departmentId = next.departmentId;
	}

	return changes;
}

/** Ошибки полей из ответа `400` под поля формы: в API сумма называется `amountMinor`. */
export function serverFieldErrors(
	error: unknown
): Partial<Record<keyof FormValues, string>> {
	const fields = Object.keys(initialValues(null));

	return Object.fromEntries(
		Object.entries(getApiFieldErrors(error)).flatMap(([field, message]) => {
			const key = field === 'amountMinor' ? 'amount' : field;

			return fields.includes(key) ? [[key, message]] : [];
		})
	);
}

/** Текст ошибки сервера, которую нельзя показать под полем. */
export function paymentActionError(error: unknown) {
	switch (getApiErrorCode(error)) {
		case 'payment_stopped':
			return 'Платёж прекращён, изменить его нельзя.';

		case 'not_found':
			return 'Платёж не\u00a0найден. Обновите страницу.';

		default:
			return getApiErrorMessage(error);
	}
}
