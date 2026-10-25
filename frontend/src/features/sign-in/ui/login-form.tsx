import {
	Alert,
	Anchor,
	Button,
	PasswordInput,
	Stack,
	Text,
	TextInput,
	Title,
} from '@mantine/core';
import { useForm, useStore } from '@tanstack/react-form';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { fieldError } from '@shared/lib/form';
import {
	IconAlertCircle,
	IconArrowLeft,
	IconEye,
	IconEyeOff,
	IconInfoCircle,
	IconLock,
} from '@shared/ui/icons';

import type { LoginNotice } from '../model/login-notice';
import { useSignIn } from '../model/use-sign-in';
import classes from './login-form.module.css';

const passwordSchema = z.object({
	email: z.string().trim().min(1, 'Введите email'),
	password: z.string().min(1, 'Введите пароль'),
});

const codeSchema = z.object({
	code: z.string().trim().min(1, 'Введите код'),
});

function Notice({ notice }: { notice: LoginNotice }) {
	const NoticeIcon =
		notice.tone === 'danger' ? IconAlertCircle : IconInfoCircle;

	return (
		<Alert
			data-tone={notice.tone}
			className={classes.notice}
			classNames={{
				title: classes.noticeText,
				message: classes.noticeText,
				icon: classes.noticeText,
			}}
			icon={<NoticeIcon size={20} />}
			title={notice.title}
		>
			{notice.text}
		</Alert>
	);
}

interface StepFormProps {
	submitLabel: string;
	submitting: boolean;
	notice: LoginNotice | null;
	blocked: boolean;
	onSubmit: () => void;
	children: ReactNode;
}

// Общая оболочка шагов: поля, сообщение и кнопка, недоступная во время отправки и блокировки.
function StepForm({
	submitLabel,
	submitting,
	notice,
	blocked,
	onSubmit,
	children,
}: StepFormProps) {
	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<Stack gap='md'>
				{children}
				{notice && <Notice notice={notice} />}
				<Button type='submit' fullWidth loading={submitting} disabled={blocked}>
					{submitLabel}
				</Button>
			</Stack>
		</form>
	);
}

interface PasswordStepProps {
	defaultEmail: string;
	locked: boolean;
	notice: LoginNotice | null;
	blocked: boolean;
	onSubmit: (values: { email: string; password: string }) => Promise<void>;
}

function PasswordStep({
	defaultEmail,
	locked,
	notice,
	blocked,
	onSubmit,
}: PasswordStepProps) {
	const form = useForm({
		defaultValues: { email: defaultEmail, password: '' },
		validators: { onSubmit: passwordSchema },
		onSubmit: ({ value }) =>
			onSubmit({ email: value.email.trim(), password: value.password }),
	});
	const submitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<StepForm
			submitLabel='Войти'
			submitting={submitting}
			notice={notice}
			blocked={blocked}
			onSubmit={() => void form.handleSubmit()}
		>
			<form.Field name='email'>
				{(field) =>
					locked ? (
						<TextInput
							label='Аккаунт Aéza'
							value={field.state.value}
							readOnly
							rightSection={<IconLock size={18} />}
						/>
					) : (
						<TextInput
							label='Email'
							type='email'
							autoComplete='username'
							value={field.state.value}
							onChange={(event) => field.handleChange(event.target.value)}
							onBlur={field.handleBlur}
							error={fieldError(field)}
						/>
					)
				}
			</form.Field>
			<form.Field name='password'>
				{(field) => (
					<PasswordInput
						label='Пароль'
						autoComplete='current-password'
						// В окне повторного входа email уже известен: фокус сразу в пароль.
						data-autofocus={locked || undefined}
						value={field.state.value}
						onChange={(event) => field.handleChange(event.target.value)}
						onBlur={field.handleBlur}
						error={fieldError(field)}
						visibilityToggleIcon={({ reveal }) =>
							reveal ? <IconEyeOff size={20} /> : <IconEye size={20} />
						}
						visibilityToggleButtonProps={{ 'aria-label': 'Показать пароль' }}
					/>
				)}
			</form.Field>
		</StepForm>
	);
}

interface CodeStepProps {
	notice: LoginNotice | null;
	codeError: boolean;
	blocked: boolean;
	onSubmit: (code: string) => Promise<void>;
}

function CodeStep({ notice, codeError, blocked, onSubmit }: CodeStepProps) {
	const form = useForm({
		defaultValues: { code: '' },
		validators: { onSubmit: codeSchema },
		onSubmit: ({ value }) => onSubmit(value.code.trim()),
	});
	const submitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<StepForm
			submitLabel='Подтвердить'
			submitting={submitting}
			notice={notice}
			blocked={blocked}
			onSubmit={() => void form.handleSubmit()}
		>
			<form.Field name='code'>
				{(field) => (
					<TextInput
						label='Код из приложения'
						inputMode='numeric'
						autoComplete='one-time-code'
						maxLength={6}
						autoFocus
						classNames={{ input: classes.code }}
						value={field.state.value}
						onChange={(event) => field.handleChange(event.target.value)}
						onBlur={field.handleBlur}
						error={
							fieldError(field) ??
							(codeError
								? 'Неверный код. Дождитесь нового в\u00a0приложении и\u00a0введите его.'
								: undefined)
						}
					/>
				)}
			</form.Field>
		</StepForm>
	);
}

interface LoginFormProps {
	/** Email окна повторного входа: вход только этим аккаунтом; без него форма страницы входа. */
	lockedEmail?: string;
	onSignedIn?: () => void;
	/** «Войти другим аккаунтом» в окне повторного входа. */
	onSwitchAccount?: () => void;
}

/** Форма входа аккаунтом Aéza: пароль, код 2FA и понятные сообщения об отказе. */
export function LoginForm({
	lockedEmail,
	onSignedIn,
	onSwitchAccount,
}: LoginFormProps) {
	const reauth = lockedEmail !== undefined;
	const signIn = useSignIn({ lockedEmail, onSignedIn });

	return (
		<Stack gap='lg'>
			{signIn.step.kind === 'password' ? (
				<>
					{reauth ? (
						<Text c='dimmed'>
							Войдите снова, чтобы продолжить. Всё, что вы ввели, сохранится,
							а&nbsp;начатое действие завершится после входа.
						</Text>
					) : (
						<Stack gap={6}>
							<Title order={1} className={classes.title}>
								Вход
							</Title>
							<Text c='dimmed'>Email и&nbsp;пароль от&nbsp;аккаунта Aéza</Text>
						</Stack>
					)}
					<PasswordStep
						defaultEmail={signIn.email}
						locked={reauth}
						notice={signIn.notice}
						blocked={signIn.blocked}
						onSubmit={signIn.submitPassword}
					/>
				</>
			) : (
				<>
					<Stack gap='xs'>
						<Button
							variant='subtle'
							color='gray'
							size='compact-sm'
							className={classes.back}
							leftSection={<IconArrowLeft size={18} />}
							onClick={signIn.backToPassword}
						>
							Назад
						</Button>
						{!reauth && (
							<Title order={1} className={classes.title}>
								Код подтверждения
							</Title>
						)}
						<Text c='dimmed'>
							Для {signIn.email} включена двухфакторная проверка. Введите код
							из&nbsp;приложения-аутентификатора.
						</Text>
					</Stack>
					<CodeStep
						notice={signIn.notice}
						codeError={signIn.codeError}
						blocked={signIn.blocked}
						onSubmit={signIn.submitCode}
					/>
				</>
			)}
			{!reauth && signIn.step.kind === 'password' && (
				<Text size='sm' c='dimmed'>
					Забыли пароль? Восстановите его в&nbsp;личном кабинете{' '}
					<Anchor
						href='https://my.aeza.ru'
						target='_blank'
						rel='noreferrer'
						fw={600}
					>
						my.aeza.ru
					</Anchor>
				</Text>
			)}
			{reauth && (
				<Button variant='subtle' color='gray' onClick={onSwitchAccount}>
					Войти другим аккаунтом
				</Button>
			)}
		</Stack>
	);
}
