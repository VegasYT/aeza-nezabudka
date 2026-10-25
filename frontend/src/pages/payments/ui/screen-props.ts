import type { Department, PaymentOccurrence } from '@shared/api';
import type { CalendarDate } from '@shared/lib/dates';

import type { PaymentsSearch, Period } from '../model/payments-search';
import type { OccurrenceHandlers } from './occurrence-actions';

/** Что страница «Платежи» даёт экрану таблицы и календаря: адрес, настройки сервера и общие действия. */
export interface ScreenProps {
	search: PaymentsSearch;
	period: Period;
	/** Период внутри фразы: «за октябрь и ноябрь». */
	phrase: string;
	today: CalendarDate;
	reminderDaysBefore: number;
	phone: boolean;
	departments: Department[];
	/** Выбран отдел, статус или валюта. */
	filtered: boolean;
	pendingId: string | null;
	handlers: OccurrenceHandlers;
	/** Лист действий телефона. */
	onOpenActions: (occurrence: PaymentOccurrence) => void;
	/** Есть только у администратора. */
	onAdd?: () => void;
	/** Меняет адрес; смена фильтров возвращает на первую страницу. */
	update: (changes: Partial<PaymentsSearch>) => void;
	resetFilters: () => void;
}
