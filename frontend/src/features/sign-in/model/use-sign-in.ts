import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
	exchangeChallenge,
	getApiError,
	getApiErrorCode,
	getRetryAfterMinutes,
	login,
	type SessionResponse,
	submitTotp,
} from '@shared/api';
import { currentUserOptions, setSession } from '@shared/auth';

import {
	challengeNotice,
	credentialsNotice,
	integrationNotice,
	limitNotice,
	type LoginNotice,
	networkNotice,
	notMemberNotice,
	unavailableNotice,
} from './login-notice';

type SignInStep = { kind: 'password' } | { kind: 'code'; challenge: string };

// Отказы, на которые форма отвечает только сообщением.
const plainNotices: Record<string, LoginNotice> = {
	invalid_credentials: credentialsNotice,
	not_a_member: notMemberNotice,
	identity_unavailable: unavailableNotice,
	integration_account: integrationNotice,
};

interface SignInOptions {
	/** Email окна повторного входа: вход только этим аккаунтом, без проверки роли. */
	lockedEmail?: string;
	/** Вызывается после входа участника, которому можно в панель. */
	onSignedIn?: () => void;
}

/** Вход аккаунтом Aéza в два шага: пароль, затем код 2FA, если его требует Aéza. */
export function useSignIn({ lockedEmail, onSignedIn }: SignInOptions) {
	const queryClient = useQueryClient();
	const [step, setStep] = useState<SignInStep>({ kind: 'password' });
	const [email, setEmail] = useState(lockedEmail ?? '');
	const [notice, setNotice] = useState<LoginNotice | null>(null);
	const [codeError, setCodeError] = useState(false);
	const [blockedUntil, setBlockedUntil] = useState<number | null>(null);

	useEffect(() => {
		if (blockedUntil === null) {
			return;
		}

		const timer = setTimeout(
			() => setBlockedUntil(null),
			blockedUntil - Date.now()
		);

		return () => clearTimeout(timer);
	}, [blockedUntil]);

	const fail = (error: unknown) => {
		const code = getApiErrorCode(error);
		const plain = code ? plainNotices[code] : undefined;

		if (plain) {
			setNotice(plain);

			return;
		}

		switch (code) {
			case 'invalid_code':
				setNotice(null);
				setCodeError(true);
				break;

			case 'invalid_challenge':
				setStep({ kind: 'password' });
				setNotice(challengeNotice);
				break;

			case 'too_many_attempts': {
				const minutes = getRetryAfterMinutes(error) ?? 1;

				setNotice(limitNotice(minutes));
				setBlockedUntil(Date.now() + minutes * 60_000);
				break;
			}

			default: {
				const message = getApiError(error)?.message;

				setNotice(message ? { tone: 'danger', text: message } : networkNotice);
			}
		}
	};

	const finish = async (response: SessionResponse) => {
		setSession({
			token: response.session,
			expiresAt: response.expiresAt,
			email: lockedEmail ?? null,
		});

		if (lockedEmail === undefined) {
			await queryClient.fetchQuery(currentUserOptions());
		}

		onSignedIn?.();
	};

	const submitPassword = async (values: {
		email: string;
		password: string;
	}) => {
		setEmail(values.email);
		setNotice(null);

		try {
			const { data } = await login({ body: values, throwOnError: true });

			if (data.requirements.length > 0) {
				setCodeError(false);
				setStep({ kind: 'code', challenge: data.challenge });

				return;
			}

			const { data: session } = await exchangeChallenge({
				body: { challenge: data.challenge },
				throwOnError: true,
			});

			await finish(session);
		} catch (error) {
			fail(error);
		}
	};

	const submitCode = async (code: string) => {
		if (step.kind !== 'code') {
			return;
		}

		setNotice(null);
		setCodeError(false);

		try {
			const { data } = await submitTotp({
				body: { challenge: step.challenge, code },
				throwOnError: true,
			});

			await finish(data);
		} catch (error) {
			fail(error);
		}
	};

	const backToPassword = () => {
		setStep({ kind: 'password' });
		setNotice(null);
		setCodeError(false);
	};

	return {
		step,
		email,
		notice,
		codeError,
		blocked: blockedUntil !== null,
		submitPassword,
		submitCode,
		backToPassword,
	};
}
