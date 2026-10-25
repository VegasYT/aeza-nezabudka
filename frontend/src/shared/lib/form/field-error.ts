import type { AnyFieldApi } from '@tanstack/react-form';

/** Текст первой ошибки поля TanStack Form после проверки схемой Zod. */
export function fieldError(field: AnyFieldApi): string | undefined {
	const [issue] = field.state.meta.errors as (
		{ message?: string } | undefined
	)[];

	return issue?.message;
}
