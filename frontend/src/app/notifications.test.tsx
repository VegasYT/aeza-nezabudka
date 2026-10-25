import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	Department,
	GroupChat,
	GroupChatUpdate,
	Role,
	SystemSettings,
	SystemSettingsUpdate,
	TelegramLink,
	TelegramSettingsUpdate,
	TelegramStatus,
} from '@shared/api';
import {
	apiErrorBody,
	apiErrorResponse,
	apiServer,
	handleCreateGroupChatLink,
	handleCreateTelegramLink,
	handleDeleteGroupChat,
	handleGetSettings,
	handleGetTelegramStatus,
	handleListGroupChats,
	handleStreamEvents,
	handleUnlinkTelegram,
	handleUpdateGroupChat,
	handleUpdateSettings,
	handleUpdateTelegramSettings,
	serveLiveEvents,
	serveNotificationsScreen,
	serveSettings,
	signIn,
	stubMatchMedia,
	telegramStatus,
} from '@shared/lib/test-utils';

import { renderApp } from './test-router';

// Доступные имена сохраняют неразрывные пробелы, getByText сводит их к обычным.
const nbsp = '\u00a0';

const it_ = { id: 'd-it', name: 'ИТ', paymentsCount: 1 };
const office = { id: 'd-office', name: 'Офис', paymentsCount: 2 };

const linked = telegramStatus({
	linked: true,
	personalEnabled: true,
	telegramName: 'Анна',
	telegramUsername: 'petrova_buh',
});

function chat(overrides: Partial<GroupChat>): GroupChat {
	return {
		id: 'c-buh',
		title: 'Бухгалтерия',
		threadId: null,
		topicName: null,
		departmentIds: null,
		blocked: false,
		linkedAt: '2026-10-23T09:00:00Z',
		...overrides,
	};
}

const buh = chat({});
const duty = chat({
	id: 'c-duty',
	title: 'ИТ-дежурные',
	departmentIds: ['d-it'],
	linkedAt: '2026-10-23T10:00:00Z',
});

/** «Сервер» уведомлений: записи меняют состояние, чтения отдают текущее. */
function serveTelegram({
	status: initial = telegramStatus(),
	departments = [it_, office] as Department[],
	chats: initialChats = [] as GroupChat[],
	link = {
		url: 'https://t.me/nezabudka_bot?start=Zx81kQ',
		expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
	} as TelegramLink,
} = {}) {
	let status = initial;
	let chats = initialChats;
	const requests: { method: string; path: string; body?: unknown }[] = [];

	serveNotificationsScreen({ status, departments, chats });
	apiServer.use(
		handleGetTelegramStatus(() => HttpResponse.json(status)),
		handleUpdateTelegramSettings(async ({ request }) => {
			const body = (await request.json()) as TelegramSettingsUpdate;

			requests.push({ method: 'PATCH', path: 'me', body });
			status = {
				...status,
				...(body.personalEnabled != null && {
					personalEnabled: body.personalEnabled,
				}),
				...('departmentIds' in body && { departmentIds: body.departmentIds }),
			};

			return HttpResponse.json(status);
		}),
		handleUnlinkTelegram(() => {
			requests.push({ method: 'DELETE', path: 'me' });
			status = telegramStatus();

			return new HttpResponse(null, { status: 204 });
		}),
		handleCreateTelegramLink(() => {
			requests.push({ method: 'POST', path: 'me/link' });

			return HttpResponse.json(link, { status: 201 });
		}),
		handleListGroupChats(() => {
			requests.push({ method: 'GET', path: 'chats' });

			return HttpResponse.json({ items: chats, total: chats.length });
		}),
		handleCreateGroupChatLink(() => {
			requests.push({ method: 'POST', path: 'chats/link' });

			return HttpResponse.json(
				{
					...link,
					url: 'https://t.me/nezabudka_bot?startgroup=Qw12',
					command: '/start@nezabudka_bot Qw12',
				},
				{ status: 201 }
			);
		}),
		handleUpdateGroupChat(async ({ request, params }) => {
			const body = (await request.json()) as GroupChatUpdate;
			const id = String(params.chat_id);

			requests.push({ method: 'PATCH', path: `chats/${id}`, body });
			chats = chats.map((item) =>
				item.id === id ? { ...item, departmentIds: body.departmentIds } : item
			);

			return HttpResponse.json(chats.find((item) => item.id === id));
		}),
		handleDeleteGroupChat(({ params }) => {
			const id = String(params.chat_id);

			requests.push({ method: 'DELETE', path: `chats/${id}` });
			chats = chats.filter((item) => item.id !== id);

			return new HttpResponse(null, { status: 204 });
		})
	);

	return {
		requests,
		setStatus: (next: TelegramStatus) => {
			status = next;
		},
		setChats: (next: GroupChat[]) => {
			chats = next;
		},
	};
}

/** Открывает «Уведомления»; возвращает поток событий, через который сервер сообщает о привязке. */
function openPage(role: Role = 'user') {
	signIn(role);

	const live = serveLiveEvents();

	renderApp('/notifications');

	return live;
}

// Остров получает заголовок, когда состояние загружено; первый рендер приложения в файле долгий.
async function personalIsland() {
	await screen.findByRole(
		'heading',
		{ level: 2, name: 'Личный Telegram' },
		{ timeout: 3000 }
	);

	return screen.getByRole('region', { name: 'Личный Telegram' });
}

beforeEach(() => {
	stubMatchMedia({ width: 1440 });
});

describe('личный Telegram не подключён', () => {
	it('показывает статус, окно напоминания и кнопку подключения', async () => {
		serveTelegram();
		openPage();

		const island = await personalIsland();

		expect(within(island).getByText('Не подключён')).toBeInTheDocument();
		expect(
			within(island).getByText(/за 3 дня до срока и в первый день просрочки/)
		).toBeInTheDocument();
		expect(island).toHaveTextContent('Из чата с ботом можно отмечать оплату.');
		expect(
			within(island).getByRole('button', { name: 'Подключить Telegram' })
		).toBeInTheDocument();
	});

	it('без бота на сервере объясняет и не предлагает подключение', async () => {
		serveTelegram({ status: telegramStatus({ botConfigured: false }) });
		openPage();

		const island = await personalIsland();

		expect(
			within(island).getByText('Telegram-бот не настроен на сервере')
		).toBeInTheDocument();
		expect(
			within(island).queryByRole('button', { name: 'Подключить Telegram' })
		).not.toBeInTheDocument();
	});

	it('ошибка загрузки и повтор', async () => {
		serveTelegram();
		apiServer.use(handleGetTelegramStatus(apiErrorResponse(500, 'internal')));

		const user = userEvent.setup();

		openPage();

		expect(
			await screen.findByText('Не удалось загрузить настройки уведомлений')
		).toBeInTheDocument();

		apiServer.use(
			handleGetTelegramStatus(() => HttpResponse.json(telegramStatus()))
		);
		await user.click(screen.getByRole('button', { name: 'Повторить' }));

		expect(await screen.findByText('Не подключён')).toBeInTheDocument();
	});
});

describe('подключение по ссылке на бота', () => {
	it('показывает ссылку, срок и QR-код, а привязка появляется сама', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date(2026, 9, 24, 14, 22));

		const server = serveTelegram({
			link: {
				url: 'https://t.me/nezabudka_bot?start=Zx81kQ',
				expiresAt: new Date(2026, 9, 24, 14, 32).toISOString(),
			},
		});
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const live = openPage();

		const island = await personalIsland();

		await user.click(
			within(island).getByRole('button', { name: 'Подключить Telegram' })
		);

		expect(
			await within(island).findByText('Ждём подтверждения из Telegram')
		).toBeInTheDocument();
		expect(
			within(island).getByRole('link', { name: 'Открыть Telegram' })
		).toHaveAttribute('href', 'https://t.me/nezabudka_bot?start=Zx81kQ');
		expect(island).toHaveTextContent(
			'Ссылка действует до 14:32 и только один раз'
		);
		expect(
			within(island).getByRole('img', { name: 'QR-код ссылки на бота' })
		).toBeInTheDocument();

		server.setStatus(linked);
		live.change({ type: 'telegram.changed', entityType: 'telegram' });

		expect(await within(island).findByText('Подключён')).toBeInTheDocument();
		expect(within(island).getByText('Анна')).toBeInTheDocument();
	});

	it('без потока событий привязка появляется опросом раз в 3 секунды', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });

		const server = serveTelegram();
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

		signIn();
		apiServer.use(
			handleStreamEvents(() => new HttpResponse(null, { status: 503 }))
		);
		renderApp('/notifications');

		const island = await personalIsland();

		await user.click(
			within(island).getByRole('button', { name: 'Подключить Telegram' })
		);
		await within(island).findByText('Ждём подтверждения из Telegram');

		server.setStatus(linked);
		await act(() => vi.advanceTimersByTimeAsync(3000));

		expect(await within(island).findByText('Подключён')).toBeInTheDocument();
	});

	it('устаревшая ссылка предлагает новую', async () => {
		const server = serveTelegram({
			link: {
				url: 'https://t.me/nezabudka_bot?start=Old',
				expiresAt: new Date(Date.now() - 1000).toISOString(),
			},
		});
		const user = userEvent.setup();

		openPage();

		const island = await personalIsland();

		await user.click(
			within(island).getByRole('button', { name: 'Подключить Telegram' })
		);

		expect(
			await within(island).findByText('Ссылка устарела')
		).toBeInTheDocument();

		await user.click(
			within(island).getByRole('button', { name: 'Получить новую ссылку' })
		);

		await waitFor(() =>
			expect(
				server.requests.filter((request) => request.path === 'me/link')
			).toHaveLength(2)
		);
	});

	it('Telegram не отвечает - сообщение и повтор', async () => {
		serveTelegram();
		apiServer.use(
			handleCreateTelegramLink(apiErrorResponse(503, 'telegram_unavailable'))
		);

		const user = userEvent.setup();

		openPage();

		const island = await personalIsland();

		await user.click(
			within(island).getByRole('button', { name: 'Подключить Telegram' })
		);

		expect(
			await within(island).findByText('Telegram не отвечает')
		).toBeInTheDocument();
		expect(
			within(island).getByRole('button', { name: 'Попробовать ещё раз' })
		).toBeInTheDocument();
	});

	it('«Отмена» возвращает кнопку подключения', async () => {
		serveTelegram();

		const user = userEvent.setup();

		openPage();

		const island = await personalIsland();

		await user.click(
			within(island).getByRole('button', { name: 'Подключить Telegram' })
		);
		await user.click(
			await within(island).findByRole('button', { name: 'Отмена' })
		);

		expect(
			within(island).getByRole('button', { name: 'Подключить Telegram' })
		).toBeInTheDocument();
		expect(within(island).getByText('Не подключён')).toBeInTheDocument();
	});
});

describe('подключённый Telegram', () => {
	it('выключение личных напоминаний', async () => {
		const server = serveTelegram({ status: linked });
		const user = userEvent.setup();

		openPage();

		const island = await personalIsland();

		expect(island).not.toHaveTextContent('Из чата с ботом');

		expect(within(island).getByText('@petrova_buh')).toBeInTheDocument();

		const toggle = within(island).getByRole('switch', {
			name: 'Присылать мне лично',
		});

		expect(toggle).toBeChecked();

		await user.click(toggle);

		expect(
			await within(island).findByText('Личные напоминания выключены')
		).toBeInTheDocument();
		expect(server.requests).toContainEqual({
			method: 'PATCH',
			path: 'me',
			body: { personalEnabled: false },
		});
	});

	it('ошибка сохранения возвращает переключатель и сообщает', async () => {
		serveTelegram({ status: linked });
		apiServer.use(
			handleUpdateTelegramSettings(() =>
				HttpResponse.json(apiErrorBody(500, 'internal'), { status: 500 })
			)
		);

		const user = userEvent.setup();

		openPage();

		const island = await personalIsland();
		const toggle = within(island).getByRole('switch', {
			name: 'Присылать мне лично',
		});

		await user.click(toggle);

		expect(await screen.findByText('Не удалось сохранить')).toBeInTheDocument();
		expect(toggle).toBeChecked();
	});

	it('отвязка после подтверждения, «Отмена» запрос не шлёт', async () => {
		const server = serveTelegram({ status: linked });
		const user = userEvent.setup();

		openPage();

		const island = await personalIsland();

		await user.click(within(island).getByRole('button', { name: 'Отвязать' }));

		let dialog = await screen.findByRole('dialog', {
			name: 'Отвязать Telegram?',
		});

		expect(within(dialog).getByText('@petrova_buh')).toBeInTheDocument();

		await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
		await waitFor(() =>
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
		);
		expect(server.requests).not.toContainEqual(
			expect.objectContaining({ method: 'DELETE' })
		);

		await user.click(within(island).getByRole('button', { name: 'Отвязать' }));
		dialog = await screen.findByRole('dialog', { name: 'Отвязать Telegram?' });
		await user.click(within(dialog).getByRole('button', { name: 'Отвязать' }));

		expect(await within(island).findByText('Не подключён')).toBeInTheDocument();
		expect(
			within(island).getByRole('button', { name: 'Подключить Telegram' })
		).toBeInTheDocument();
		expect(server.requests).toContainEqual({ method: 'DELETE', path: 'me' });
	});

	it('заблокированный бот: объяснение и ссылка на бота', async () => {
		serveTelegram({ status: { ...linked, blocked: true } });
		openPage();

		const island = await personalIsland();

		expect(within(island).getByText('Бот остановлен')).toBeInTheDocument();
		expect(
			within(island).getByText('Вы остановили бота в Telegram')
		).toBeInTheDocument();
		expect(
			within(island).getByRole('button', {
				name: `Получить ссылку на${nbsp}бота`,
			})
		).toBeInTheDocument();
		expect(
			within(island).queryByRole('switch', { name: 'Присылать мне лично' })
		).not.toBeInTheDocument();
	});
});

describe('какие платежи присылать лично', () => {
	it('только отдел ИТ', async () => {
		const server = serveTelegram({ status: linked });
		const user = userEvent.setup();

		openPage();

		const island = await personalIsland();

		expect(within(island).getByText('Все платежи')).toBeInTheDocument();

		await user.click(
			within(island).getByRole('button', {
				name: 'Изменить, какие платежи присылать',
			})
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Какие платежи присылать',
		});

		await user.click(
			within(dialog).getByRole('radio', { name: 'Только выбранные отделы' })
		);
		await user.click(
			await within(dialog).findByRole('checkbox', { name: 'ИТ' })
		);
		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		expect(
			await within(island).findByText('Только отделы: ИТ')
		).toBeInTheDocument();
		expect(server.requests).toContainEqual({
			method: 'PATCH',
			path: 'me',
			body: { departmentIds: ['d-it'] },
		});
	});

	it('без отмеченных отделов сохранить нельзя, «Все платежи» шлёт null', async () => {
		const server = serveTelegram({
			status: { ...linked, departmentIds: ['d-it'] },
		});
		const user = userEvent.setup();

		openPage();

		const island = await personalIsland();

		await user.click(
			within(island).getByRole('button', {
				name: 'Изменить, какие платежи присылать',
			})
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Какие платежи присылать',
		});

		await user.click(
			await within(dialog).findByRole('checkbox', { name: 'ИТ' })
		);

		expect(
			within(dialog).getByText(
				'Отметьте хотя бы один отдел или выберите «Все платежи».'
			)
		).toBeInTheDocument();
		expect(
			within(dialog).getByRole('button', { name: 'Сохранить' })
		).toBeDisabled();

		await user.click(
			within(dialog).getByRole('radio', { name: 'Все платежи' })
		);
		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		await waitFor(() =>
			expect(server.requests).toContainEqual({
				method: 'PATCH',
				path: 'me',
				body: { departmentIds: null },
			})
		);
	});
});

it('общий чат и образцы напоминаний от сегодня сервера', async () => {
	serveTelegram();
	openPage();

	const aside = await screen.findByRole('region', {
		name: `Общий и${nbsp}групповые чаты`,
	});

	expect(within(aside).getByText('Подключены')).toBeInTheDocument();

	const samples = screen.getByRole('region', {
		name: 'Как выглядят напоминания',
	});

	expect(
		within(samples).getByText(
			'Напоминание: до срока оплаты 3 дня. Сервер (ИТ) - 25,00 USD, срок 27.10.2026'
		)
	).toBeInTheDocument();
});

it('с чеками на сервере подсказывает, как приложить чек из Telegram', async () => {
	serveTelegram();
	serveSettings({ receiptsEnabled: true });
	openPage();

	const samples = await screen.findByRole('region', {
		name: 'Как выглядят напоминания',
	});

	expect(samples).toHaveTextContent(
		'Чтобы приложить чек, ответьте файлом на сообщение бота.'
	);
});

describe('групповые чаты', () => {
	it('администратор видит группы с отделами и датой', async () => {
		serveTelegram({ chats: [buh, duty] });
		openPage('admin');

		const island = await screen.findByRole('region', {
			name: 'Групповые чаты',
		});
		const rows = await within(island).findAllByRole('row');

		expect(rows.slice(1).map((row) => row.textContent)).toEqual([
			expect.stringContaining('БухгалтерияВсе платежи23.10.2026'),
			expect.stringContaining('ИТ-дежурныеИТ23.10.2026'),
		]);
	});

	it('пользователю острова нет, и список групп не запрашивается', async () => {
		const server = serveTelegram({ chats: [buh] });

		openPage('user');

		await personalIsland();

		expect(
			screen.queryByRole('region', { name: 'Групповые чаты' })
		).not.toBeInTheDocument();
		expect(server.requests).not.toContainEqual(
			expect.objectContaining({ path: 'chats' })
		);
	});

	it('без групп - пустое состояние', async () => {
		serveTelegram();
		openPage('admin');

		expect(
			await screen.findByText('Групповых чатов пока нет.')
		).toBeInTheDocument();
	});

	it('ошибка списка с повтором', async () => {
		let fail = true;

		serveTelegram();
		apiServer.use(
			handleListGroupChats(() =>
				fail
					? HttpResponse.json(apiErrorBody(500, 'internal'), { status: 500 })
					: HttpResponse.json({ items: [buh], total: 1 })
			)
		);

		const user = userEvent.setup();

		openPage('admin');

		expect(
			await screen.findByText('Не удалось загрузить групповые чаты')
		).toBeInTheDocument();

		fail = false;
		await user.click(screen.getByRole('button', { name: 'Повторить' }));

		expect(await screen.findByText('Бухгалтерия')).toBeInTheDocument();
	});

	it('новая группа появляется в списке сама, ожидание закрывается', async () => {
		const server = serveTelegram({ chats: [buh] });
		const user = userEvent.setup();

		const live = openPage('admin');

		const island = await screen.findByRole('region', {
			name: 'Групповые чаты',
		});

		await user.click(
			await within(island).findByRole('button', { name: 'Подключить группу' })
		);

		expect(
			await within(island).findByText('Ждём подключения группы или темы')
		).toBeInTheDocument();
		expect(
			within(island).getByRole('link', { name: 'Открыть Telegram' })
		).toHaveAttribute('href', 'https://t.me/nezabudka_bot?startgroup=Qw12');

		server.setChats([
			buh,
			chat({ id: 'c-fin', title: 'Финансы', linkedAt: '2026-10-24T11:00:00Z' }),
		]);
		live.change({ type: 'telegram_chat.linked', entityType: 'telegram_chat' });

		expect(await within(island).findByText('Финансы')).toBeInTheDocument();
		expect(
			within(island).queryByText('Ждём подключения группы или темы')
		).not.toBeInTheDocument();
	});

	it('команда для темы копируется, новая тема группы закрывает ожидание', async () => {
		const server = serveTelegram({ chats: [buh] });
		const user = userEvent.setup();

		const live = openPage('admin');

		const island = await screen.findByRole('region', {
			name: 'Групповые чаты',
		});

		await user.click(
			await within(island).findByRole('button', { name: 'Подключить группу' })
		);

		const option = await within(island).findByRole('region', {
			name: /^Если бот уже в\sгруппе/,
		});

		expect(option).toHaveTextContent('/start@nezabudka_bot Qw12');

		await user.click(
			within(option).getByRole('button', { name: 'Копировать' })
		);

		expect(await navigator.clipboard.readText()).toBe(
			'/start@nezabudka_bot Qw12'
		);
		expect(
			within(option).getByRole('button', { name: 'Скопировано' })
		).toBeInTheDocument();

		server.setChats([
			buh,
			chat({
				id: 'c-rent',
				threadId: 12,
				topicName: 'Аренда',
				linkedAt: '2026-10-24T11:00:00Z',
			}),
		]);
		live.change({ type: 'telegram_chat.linked', entityType: 'telegram_chat' });

		expect(
			await within(island).findByText('Бухгалтерия → Аренда')
		).toBeInTheDocument();
		expect(
			within(island).queryByText('Ждём подключения группы или темы')
		).not.toBeInTheDocument();
	});

	it('темы одной группы - отдельными строками со своими отделами', async () => {
		serveTelegram({
			chats: [
				chat({
					id: 'c-rent',
					threadId: 12,
					topicName: 'Аренда',
					departmentIds: ['d-office'],
				}),
				chat({
					id: 'c-servers',
					threadId: 14,
					topicName: 'Серверы',
					departmentIds: ['d-it'],
				}),
			],
		});

		openPage('admin');

		const rent = (await screen.findByText('Бухгалтерия → Аренда')).closest(
			'tr'
		);
		const servers = screen.getByText('Бухгалтерия → Серверы').closest('tr');

		expect(rent).toHaveTextContent('Офис');
		expect(servers).toHaveTextContent('ИТ');
		expect(
			screen.getByRole('button', {
				name: 'Отключить группу «Бухгалтерия → Серверы»',
			})
		).toBeInTheDocument();
	});

	it('«Подключить снова» ждёт, пока бота вернут в эту группу', async () => {
		const server = serveTelegram({ chats: [buh, { ...duty, blocked: true }] });
		const user = userEvent.setup();

		const live = openPage('admin');

		const island = await screen.findByRole('region', {
			name: 'Групповые чаты',
		});

		expect(
			await within(island).findByText('Бот удалён из группы')
		).toBeInTheDocument();

		await user.click(
			within(island).getByRole('button', { name: 'Подключить снова' })
		);

		expect(
			await within(island).findByText('Ждём, пока бота вернут в группу')
		).toBeInTheDocument();
		expect(
			within(island).getByText('Верните бота в группу «ИТ-дежурные»')
		).toBeInTheDocument();
		expect(island).toHaveTextContent('Отделы группы останутся прежними.');

		server.setChats([buh, duty]);
		live.change({ type: 'telegram_chat.linked', entityType: 'telegram_chat' });

		await waitFor(() =>
			expect(
				within(island).queryByText('Ждём, пока бота вернут в группу')
			).not.toBeInTheDocument()
		);
		expect(
			within(island).queryByText('Бот удалён из группы')
		).not.toBeInTheDocument();
	});

	it('отделы группы: только ИТ', async () => {
		const server = serveTelegram({ chats: [buh] });
		const user = userEvent.setup();

		openPage('admin');

		await user.click(
			await screen.findByRole('button', { name: 'Отделы группы «Бухгалтерия»' })
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Какие платежи присылать',
		});

		expect(
			within(dialog).getByText('в группу «Бухгалтерия»')
		).toBeInTheDocument();

		await user.click(
			within(dialog).getByRole('radio', { name: 'Только выбранные отделы' })
		);
		await user.click(
			await within(dialog).findByRole('checkbox', { name: 'ИТ' })
		);
		await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

		await waitFor(() =>
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
		);
		expect(server.requests).toContainEqual({
			method: 'PATCH',
			path: 'chats/c-buh',
			body: { departmentIds: ['d-it'] },
		});

		const island = screen.getByRole('region', { name: 'Групповые чаты' });
		const [, row] = within(island).getAllByRole('row');

		expect(row).toHaveTextContent('БухгалтерияИТ');
	});

	it('отключение группы', async () => {
		const server = serveTelegram({ chats: [buh, duty] });
		const user = userEvent.setup();

		openPage('admin');

		await user.click(
			await screen.findByRole('button', {
				name: 'Отключить группу «ИТ-дежурные»',
			})
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Отключить группу?',
		});

		await user.click(within(dialog).getByRole('button', { name: 'Отключить' }));

		await waitFor(() =>
			expect(screen.queryByText('ИТ-дежурные')).not.toBeInTheDocument()
		);
		expect(server.requests).toContainEqual({
			method: 'DELETE',
			path: 'chats/c-duty',
		});
	});

	it('группа уже отключена: сообщение и перечитанный список', async () => {
		const server = serveTelegram({ chats: [buh, duty] });

		apiServer.use(
			handleDeleteGroupChat(() => {
				server.setChats([buh]);

				return HttpResponse.json(apiErrorBody(404, 'not_found'), {
					status: 404,
				});
			})
		);

		const user = userEvent.setup();

		openPage('admin');

		await user.click(
			await screen.findByRole('button', {
				name: 'Отключить группу «ИТ-дежурные»',
			})
		);

		const dialog = await screen.findByRole('dialog', {
			name: 'Отключить группу?',
		});

		await user.click(within(dialog).getByRole('button', { name: 'Отключить' }));

		expect(
			await within(dialog).findByText('Группа уже отключена.')
		).toBeInTheDocument();
		await waitFor(() =>
			expect(
				screen.queryByRole('row', { name: /ИТ-дежурные/ })
			).not.toBeInTheDocument()
		);
	});
});

describe('общее окно напоминаний', () => {
	/** Настройки на «сервере»: `PATCH /settings` меняет окно, `null` возвращает значение сервера 3. */
	function serveWindow() {
		const bodies: SystemSettingsUpdate[] = [];
		let window = 3;
		const settings = (): SystemSettings => ({
			today: '2026-10-24',
			timezone: 'Europe/Moscow',
			reminderDaysBefore: window,
			reminderDaysBeforeDefault: 3,
			receiptsEnabled: false,
		});

		serveTelegram();
		apiServer.use(
			handleGetSettings(() => HttpResponse.json(settings())),
			handleUpdateSettings(async ({ request }) => {
				const body = (await request.json()) as SystemSettingsUpdate;

				bodies.push(body);
				window = body.reminderDaysBefore ?? 3;

				return HttpResponse.json(settings());
			})
		);

		return bodies;
	}

	it('администратор меняет окно, «Как на сервере» возвращает значение сервера', async () => {
		const bodies = serveWindow();
		const user = userEvent.setup();

		openPage('admin');

		const island = await screen.findByRole('region', {
			name: 'Когда напоминать',
		});
		const field = within(island).getByLabelText('За сколько дней до срока');
		const save = within(island).getByRole('button', { name: 'Сохранить' });
		const reset = /^Как на\sсервере \(3\)$/;

		expect(field).toHaveValue('3');
		expect(save).toBeDisabled();
		expect(
			within(island).queryByRole('button', { name: reset })
		).not.toBeInTheDocument();

		await user.clear(field);
		await user.type(field, '5');
		await user.click(save);

		expect(
			await screen.findByText('Окно напоминаний сохранено')
		).toBeInTheDocument();
		expect(bodies).toEqual([{ reminderDaysBefore: 5 }]);

		await user.click(within(island).getByRole('button', { name: reset }));

		await waitFor(() =>
			expect(bodies).toEqual([
				{ reminderDaysBefore: 5 },
				{ reminderDaysBefore: null },
			])
		);
		await waitFor(() => expect(field).toHaveValue('3'));
		expect(
			within(island).queryByRole('button', { name: reset })
		).not.toBeInTheDocument();
	});

	it('пользователь окна не видит', async () => {
		serveWindow();
		openPage();

		await personalIsland();

		expect(
			screen.queryByRole('region', { name: 'Когда напоминать' })
		).not.toBeInTheDocument();
	});
});
