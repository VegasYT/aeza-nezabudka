import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaymentOccurrence, PaymentOccurrenceUpdate } from '@shared/api';
import {
	apiErrorBody,
	apiServer,
	handleAttachReceipt,
	handleDeleteReceipt,
	handleGetReceipt,
	handleListPaymentOccurrences,
	handleUpdatePaymentOccurrence,
	servePaymentsScreen,
	serveSettings,
	signIn,
	stubMatchMedia,
} from '@shared/lib/test-utils';

import { renderApp } from './test-router';

const unpaid: PaymentOccurrence = {
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
	receipt: null,
};
const paid: PaymentOccurrence = {
	...unpaid,
	paid: true,
	paidOn: '2026-10-22',
	paidByLogin: 'buh.petrova@company.ru',
	daysOverdue: 3,
};
const receipt = {
	fileName: 'check.png',
	contentType: 'image/png',
	size: 250_000,
	uploadedAt: '2026-10-22T09:00:00Z',
	uploadedByLogin: 'buh.petrova@company.ru',
};
const withReceipt: PaymentOccurrence = { ...paid, receipt };
const title = 'Аренда офиса, срок 19.10.2026';

/** Периоды на «сервере»: отметка, чек и удаление меняют ответ списка; запросы записываются по порядку. */
function serveOccurrence(initial: PaymentOccurrence, { receipts = true } = {}) {
	let current = initial;
	const calls: string[] = [];

	servePaymentsScreen({ occurrences: [initial] });
	serveSettings({ receiptsEnabled: receipts });
	apiServer.use(
		handleListPaymentOccurrences(() =>
			HttpResponse.json({ items: [current], total: 1 })
		),
		handleUpdatePaymentOccurrence(async ({ request }) => {
			const body = (await request.json()) as PaymentOccurrenceUpdate;

			calls.push(`PATCH paid=${body.paid}`);
			current = body.paid
				? { ...paid, paidOn: body.paidOn ?? '2026-10-24' }
				: unpaid;

			return HttpResponse.json(current);
		}),
		handleAttachReceipt(async ({ request }) => {
			// Имя файла MSW в jsdom теряет, в браузере FormData его сохраняет.
			calls.push(
				(await request.formData()).has('file') ? 'PUT' : 'PUT без файла'
			);
			current = { ...current, receipt: { ...receipt, fileName: 'check.pdf' } };

			return HttpResponse.json(current);
		}),
		// Тело строкой: у Blob из jsdom нет stream(), который нужен MSW.
		handleGetReceipt(
			() =>
				new HttpResponse('png', { headers: { 'Content-Type': 'image/png' } })
		),
		handleDeleteReceipt(() => {
			calls.push('DELETE');
			current = { ...current, receipt: null };

			return new HttpResponse(null, { status: 204 });
		})
	);

	return calls;
}

// В jsdom нет blob:-ссылок, а окно чека показывает файл по ним.
beforeAll(() => {
	URL.createObjectURL = () => 'blob:receipt';
	URL.revokeObjectURL = () => {};
});

beforeEach(() => {
	stubMatchMedia({ width: 1440 });
	signIn('user');
});

async function openMenuItem(
	user: ReturnType<typeof userEvent.setup>,
	item: string
) {
	await user.click(
		await screen.findByRole('button', { name: `Действия: ${title}` })
	);
	await user.click(screen.getByRole('menuitem', { name: item }));
}

/** «Оплачено в другой день»: 22 октября и файл чека. */
async function payWithReceipt(
	user: ReturnType<typeof userEvent.setup>,
	file: File
) {
	await openMenuItem(user, 'Оплачено в другой день');

	const dialog = await screen.findByRole('dialog', {
		name: 'Оплачено в другой день',
	});
	const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');

	await user.click(
		within(dialog).getByRole('button', { name: '22 октября 2026' })
	);
	await user.upload(input!, file);

	return dialog;
}

const pdf = () => new File(['%PDF'], 'check.pdf', { type: 'application/pdf' });

describe('чек оплаты', () => {
	it('оплата в другой день с чеком: сначала отметка, потом чек', async () => {
		const calls = serveOccurrence(unpaid);
		const user = userEvent.setup();

		renderApp('/payments');

		const dialog = await payWithReceipt(user, pdf());

		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		expect(
			await screen.findByRole('button', { name: `Чек: ${title}` })
		).toBeInTheDocument();
		expect(calls).toEqual(['PATCH paid=true', 'PUT']);
	});

	it('чек не загрузился: оплата остаётся, «Загрузить чек» повторяет только загрузку', async () => {
		const calls = serveOccurrence(unpaid);
		let failed = false;

		apiServer.use(
			handleAttachReceipt(
				() => {
					failed = true;

					return HttpResponse.json(apiErrorBody(503, 'storage_unavailable'), {
						status: 503,
					});
				},
				{ once: true }
			)
		);

		const user = userEvent.setup();

		renderApp('/payments');

		const dialog = await payWithReceipt(user, pdf());

		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		expect(
			await within(dialog).findByText(
				/Оплата отмечена, а\sчек не\sзагрузился\. Хранилище чеков сейчас недоступно/
			)
		).toBeInTheDocument();
		expect(failed).toBe(true);

		await user.click(
			within(dialog).getByRole('button', { name: 'Загрузить чек' })
		);

		await waitFor(() =>
			expect(
				screen.queryByRole('dialog', { name: 'Оплачено в другой день' })
			).not.toBeInTheDocument()
		);
		expect(calls).toEqual(['PATCH paid=true', 'PUT']);
	});

	it('файл больше 10 МБ не уходит', async () => {
		const calls = serveOccurrence(unpaid);
		const user = userEvent.setup();
		const big = pdf();

		Object.defineProperty(big, 'size', { value: 15 * 1024 * 1024 });
		renderApp('/payments');

		const dialog = await payWithReceipt(user, big);

		expect(
			within(dialog).getByText('Нужен файл PDF, JPEG, PNG или WebP до 10 МБ')
		).toBeInTheDocument();
		expect(
			within(dialog).getByRole('button', { name: 'Сохранить' })
		).toBeDisabled();
		expect(calls).toEqual([]);
	});

	it('просмотр картинки и удаление чека с подтверждением', async () => {
		// Ответ blob MSW в jsdom собирает через Blob, а у Blob из jsdom нет stream():
		// подставляем Blob из Node, его отдаёт Response.
		vi.stubGlobal('Blob', (await new Response('').blob()).constructor);

		const calls = serveOccurrence(withReceipt);
		const user = userEvent.setup();

		renderApp('/payments');

		await user.click(
			await screen.findByRole('button', { name: `Чек: ${title}` })
		);

		const dialog = await screen.findByRole('dialog', { name: 'Чек' });

		expect(
			await within(dialog).findByRole('img', { name: 'Чек check.png' })
		).toHaveAttribute('src', 'blob:receipt');
		expect(dialog).toHaveTextContent('244 КБ');

		await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
		await user.click(
			within(dialog).getByRole('button', { name: 'Удалить чек' })
		);

		expect(await screen.findByText('Чек удалён')).toBeInTheDocument();
		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: `Чек: ${title}` })
			).not.toBeInTheDocument()
		);
		expect(calls).toEqual(['DELETE']);
	});

	it('отмена оплаты с чеком предупреждает, что чек удалится', async () => {
		const calls = serveOccurrence(withReceipt);
		const user = userEvent.setup();

		renderApp('/payments');
		await openMenuItem(user, 'Отменить оплату');

		const dialog = await screen.findByRole('dialog', {
			name: 'Отменить оплату?',
		});

		expect(dialog).toHaveTextContent('Чек «check.png» тоже будет удалён.');
		expect(calls).toEqual([]);

		await user.click(
			within(dialog).getByRole('button', { name: 'Отменить оплату' })
		);

		await waitFor(() => expect(calls).toEqual(['PATCH paid=false']));
	});

	it('без хранилища на сервере чеков в панели нет', async () => {
		serveOccurrence(withReceipt, { receipts: false });

		const user = userEvent.setup();

		renderApp('/payments');
		await user.click(
			await screen.findByRole('button', { name: `Действия: ${title}` })
		);

		expect(
			screen.queryByRole('button', { name: `Чек: ${title}` })
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole('menuitem', { name: /Чек|Приложить чек/ })
		).not.toBeInTheDocument();
	});
});
