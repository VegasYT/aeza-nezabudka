/** Сообщение формы входа: ошибка (`danger`) или пояснение (`info`). */
export interface LoginNotice {
	tone: 'danger' | 'info';
	title?: string;
	text: string;
}

export const credentialsNotice: LoginNotice = {
	tone: 'danger',
	text: 'Неверный email или пароль.',
};

export const notMemberNotice: LoginNotice = {
	tone: 'info',
	title: 'Нет доступа к\u00a0Незабудке',
	text: 'Пароль верный, но этого аккаунта нет в\u00a0списке участников. Доступ выдаёт администратор.',
};

export const integrationNotice: LoginNotice = {
	tone: 'info',
	title: 'Это аккаунт для интеграций',
	text: 'Им пользуются другие системы через API. Войдите своим аккаунтом сотрудника.',
};

export const unavailableNotice: LoginNotice = {
	tone: 'danger',
	title: 'Сервис входа Aéza не отвечает',
	text: 'Попробуйте войти через несколько минут.',
};

export const challengeNotice: LoginNotice = {
	tone: 'info',
	text: 'Вход занял слишком много времени. Введите пароль ещё раз.',
};

export const networkNotice: LoginNotice = {
	tone: 'danger',
	text: 'Не удалось связаться с\u00a0сервером. Проверьте подключение и\u00a0попробуйте ещё раз.',
};

/** Сообщение о превышении предела попыток с минутами ожидания. */
export function limitNotice(minutes: number): LoginNotice {
	return {
		tone: 'danger',
		title: 'Слишком много неудачных попыток',
		text: `Вход временно закрыт. Повторите через ${minutes}\u00a0мин.`,
	};
}
