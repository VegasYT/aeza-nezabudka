import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PaymentOccurrence } from '@shared/api';
import {
	apiErrorBody,
	apiServer,
	handleStreamEvents,
	serveCurrentUserForToken,
	servePaymentsScreen,
	serveLiveEvents,
	serveSignInFlow,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';

import { renderApp } from './test-router';

const rent: PaymentOccurrence = {
	id: 'o-rent',
	recurringPayment: { id: 'p-rent', name: 'Аренда офиса', stopped: false },
	department: null,
	dueDate: '2026-10-19',
	amountMinor: 15_000_000,
	currency: 'RUB',
	paid: false,
	paidOn: null,
	paidByLogin: null,
	overdue: true,
	daysOverdue: 5,
};
const paidByColleague: PaymentOccurrence = {
	...rent,
	paid: true,
	paidOn: '2026-10-24',
	paidByLogin: 'k.orlova@company.ru',
};
const paidEvent = {
	type: 'occurrence.paid',
	entityType: 'occurrence',
	entityId: 'o-rent',
	entityName: 'Аренда офиса',
	actorLogin: 'k.orlova@company.ru',
};

beforeEach(() => {
	stubMatchMedia({ width: 1440 });
	servePaymentsScreen({ occurrences: [rent] });
});

/** «Платежи» с одним просроченным периодом и открытым потоком событий. */
async function openPayments() {
	const { email } = signIn('user');
	const live = serveLiveEvents();

	renderApp('/payments');

	expect(await screen.findByText('Просрочено')).toBeInTheDocument();
	await waitFor(() => expect(live.connections).toBe(1));

	return { live, email };
}

describe('обновление по потоку событий', () => {
	it('оплата другим участником обновляет строку и показывает уведомление', async () => {
		const { live } = await openPayments();

		servePaymentsScreen({ occurrences: [paidByColleague] });
		live.change(paidEvent);

		expect(
			await screen.findByText('Оплачено с опозданием')
		).toBeInTheDocument();
		expect(await screen.findByText('Отмечена оплата')).toBeInTheDocument();
		expect(
			screen.getByText('Аренда офиса, k.orlova@company.ru')
		).toBeInTheDocument();
	});

	it('своя отметка из другой вкладки - без уведомления', async () => {
		const { live, email } = await openPayments();

		servePaymentsScreen({
			occurrences: [{ ...paidByColleague, paidByLogin: email }],
		});
		live.change({ ...paidEvent, actorLogin: email });

		expect(
			await screen.findByText('Оплачено с опозданием')
		).toBeInTheDocument();
		expect(screen.queryByText('Отмечена оплата')).not.toBeInTheDocument();
	});

	it('после закрытия потока сервером панель подключается снова и перечитывает данные', async () => {
		const { live } = await openPayments();

		servePaymentsScreen({ occurrences: [paidByColleague] });
		live.close();

		expect(
			await screen.findByText('Оплачено с опозданием')
		).toBeInTheDocument();
		expect(live.connections).toBe(2);
	});

	it('resync перечитывает данные', async () => {
		const { live } = await openPayments();

		servePaymentsScreen({ occurrences: [paidByColleague] });
		live.resync();

		expect(
			await screen.findByText('Оплачено с опозданием')
		).toBeInTheDocument();
	});

	it('401 при подключении открывает повторный вход, после входа поток подключается снова', async () => {
		const { live, email } = await openPayments();
		const user = userEvent.setup();

		// Сессия закончилась на сервере: поток и профиль принимают только новый токен.
		serveSignInFlow();
		serveCurrentUserForToken('token-new');
		apiServer.use(
			handleStreamEvents(() =>
				HttpResponse.json(apiErrorBody(401, 'not_auth'), { status: 401 })
			)
		);
		live.close();

		const dialog = await screen.findByRole('dialog', {
			name: 'Сессия закончилась',
		});
		const next = serveLiveEvents();

		expect(within(dialog).getByLabelText('Аккаунт Aéza')).toHaveValue(email);
		await user.type(within(dialog).getByLabelText('Пароль'), 'secret');
		await user.click(within(dialog).getByRole('button', { name: 'Войти' }));

		await waitFor(() => expect(next.connections).toBe(1));
	});
});
