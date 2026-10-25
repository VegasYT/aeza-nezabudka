import { IconBase, type IconProps } from './icon-base';

// Контуры взяты из личного кабинета Aéza (my.aeza.net) без изменений, чтобы значки совпадали с продуктами компании.
// Солнца, луны, монитора, перечёркнутого глаза, предупреждения, информации и выхода в наборе Aéza нет:
// они нарисованы по тем же правилам, что и IconBase.
// Плюс, карандаш, корзина, три точки и питание взяты из макетов панели и нарисованы по тем же правилам.

/** Документ с текстом. */
export function IconDocument(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M19 8.625V18C19 19.6569 17.6569 21 16 21H8C6.34315 21 5 19.6569 5 18L5 6C5 4.34315 6.34315 3 8 3L13.5 3L19 8.625ZM13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625L19 8.625M9 13L15 13M9 17H15' />
		</IconBase>
	);
}

/** Колокольчик уведомлений. */
export function IconBell(props: IconProps) {
	return (
		<IconBase {...props}>
			<path
				fill='currentColor'
				stroke='none'
				d='M17 9H17.75V9H17ZM12 4V4.75C14.3472 4.75 16.25 6.65279 16.25 9H17H17.75C17.75 5.82436 15.1756 3.25 12 3.25V4ZM17 9H16.25V11.76H17H17.75V9H17ZM18.1752 13.9365L17.6318 14.4535C18.0156 14.8568 18.25 15.3998 18.25 16H19H19.75C19.75 14.9995 19.3568 14.0903 18.7185 13.4195L18.1752 13.9365ZM18 17V16.25H6V17V17.75H18V17ZM5 16H5.75C5.75 15.3998 5.98436 14.8568 6.36817 14.4535L5.82484 13.9365L5.2815 13.4195C4.64319 14.0903 4.25 14.9995 4.25 16H5ZM7 11.76H7.75V9H7H6.25V11.76H7ZM7 9H7.75C7.75 6.65279 9.65279 4.75 12 4.75V4V3.25C8.82436 3.25 6.25 5.82436 6.25 9H7ZM6 17V16.25C5.86193 16.25 5.75 16.1381 5.75 16H5H4.25C4.25 16.9665 5.0335 17.75 6 17.75V17ZM19 16H18.25C18.25 16.1381 18.1381 16.25 18 16.25V17V17.75C18.9665 17.75 19.75 16.9665 19.75 16H19ZM5.82484 13.9365L6.36817 14.4535C6.93465 13.8581 7.75 12.942 7.75 11.76H7H6.25C6.25 12.2727 5.88327 12.787 5.2815 13.4195L5.82484 13.9365ZM17 11.76H16.25C16.25 12.942 17.0654 13.8581 17.6318 14.4535L18.1752 13.9365L18.7185 13.4195C18.1167 12.787 17.75 12.2727 17.75 11.76H17Z'
			/>
			<path d='M13.7976 19.8767C13.6312 20.2179 13.3712 20.5046 13.048 20.7035C12.7247 20.9023 12.3516 21.0051 11.9721 20.9998C11.5926 20.9945 11.2224 20.8813 10.9049 20.6735C10.5873 20.4657 10.3354 20.1718 10.1786 19.8262M12 3V4' />
		</IconBase>
	);
}

/** Две стрелки по кругу: повтор. */
export function IconRepeat(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M9.95406 4.5L7.22703 7.22703C6.00552 8.44854 5.25 10.136 5.25 12C5.25 15.2124 7.49402 17.9006 10.5 18.5827M9.95406 8.25V4.5H6M13.5 5.41726C16.506 6.09936 18.75 8.78762 18.75 12C18.75 13.864 17.9945 15.5515 16.773 16.773L14.0459 19.5M14.0459 15.75V19.5H18' />
		</IconBase>
	);
}

/** Портфель. */
export function IconBriefcase(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M3 10C3 8.89543 3.89543 8 5 8H19C20.1046 8 21 8.89543 21 10V12C21 12.5523 20.5523 13 20 13H4C3.44772 13 3 12.5523 3 12V10Z' />
			<path d='M9 6C9 4.89543 9.89543 4 11 4H13C14.1046 4 15 4.89543 15 6V8H9V6Z' />
			<path d='M4 13H20V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V13ZM12 12V14' />
		</IconBase>
	);
}

/** Два человека. */
export function IconUsers(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M3 19V18C3 15.7909 4.79086 14 7 14H11C13.2091 14 15 15.7909 15 18V19M15 11C16.6569 11 18 9.65685 18 8C18 6.34315 16.6569 5 15 5M21 19V18C21 15.7909 19.2091 14 17 14H16.5M12 8C12 9.65685 10.6569 11 9 11C7.34315 11 6 9.65685 6 8C6 6.34315 7.34315 5 9 5C10.6569 5 12 6.34315 12 8Z' />
		</IconBase>
	);
}

/** Солнце: светлая схема. */
export function IconSun(props: IconProps) {
	return (
		<IconBase {...props}>
			<circle cx='12' cy='12' r='3.75' />
			<path d='M12 3.75V5.5M12 18.5V20.25M3.75 12H5.5M18.5 12H20.25M6.17 6.17L7.4 7.4M16.6 16.6L17.83 17.83M6.17 17.83L7.4 16.6M16.6 7.4L17.83 6.17' />
		</IconBase>
	);
}

/** Месяц: тёмная схема. */
export function IconMoon(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M19.5 14.25A7.5 7.5 0 0 1 9.75 4.5A7.75 7.75 0 1 0 19.5 14.25Z' />
		</IconBase>
	);
}

const EYE = `M12.0007 5C16.2567 5.00016 19.8901 7.65948 21.3335 11.4067C21.4806 11.7884 21.4806 12.2116 21.3335 12.5933C19.8901 16.3405 16.2567 18.9998 12.0007 19C7.74457 19 4.11039 16.3407 2.6669 12.5932C2.51989 12.2116 2.51989 11.7884 2.6669 11.4068C4.11039 7.65934 7.74457 5 12.0007 5ZM15.0003 12C15.0003 13.6569 13.6572 15 12.0003 15C10.3435 15 9.00033 13.6569 9.00033 12C9.00033 10.3431 10.3435 9 12.0003 9C13.6572 9 15.0003 10.3431 15.0003 12Z`;

/** Глаз: показать пароль. */
export function IconEye(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d={EYE} />
		</IconBase>
	);
}

/** Перечёркнутый глаз: скрыть пароль. */
export function IconEyeOff(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d={EYE} />
			<path d='M4 4L20 20' />
		</IconBase>
	);
}

/** Замок: поле нельзя изменить. */
export function IconLock(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M16 9V6C16 4.34315 14.6569 3 13 3H11C9.34315 3 8 4.34315 8 6V9M16 9H8M16 9C17.6569 9 19 10.3431 19 12V18C19 19.6569 17.6569 21 16 21H8C6.34315 21 5 19.6569 5 18V12C5 10.3431 6.34315 9 8 9M12 14V17M13 14C13 14.5523 12.5523 15 12 15C11.4477 15 11 14.5523 11 14C11 13.4477 11.4477 13 12 13C12.5523 13 13 13.4477 13 14Z' />
		</IconBase>
	);
}

/** Стрелка назад. */
export function IconArrowLeft(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M20 12H4M10 18L4 12L10 6' />
		</IconBase>
	);
}

/** Круг с восклицательным знаком: ошибка. */
export function IconAlertCircle(props: IconProps) {
	return (
		<IconBase {...props}>
			<circle cx='12' cy='12' r='8.25' />
			<path d='M12 7.75V12.75M12 16.25V16.26' />
		</IconBase>
	);
}

/** Круг с буквой «i»: пояснение. */
export function IconInfoCircle(props: IconProps) {
	return (
		<IconBase {...props}>
			<circle cx='12' cy='12' r='8.25' />
			<path d='M12 11.25V16.25M12 7.75V7.76' />
		</IconBase>
	);
}

/** Дверь со стрелкой наружу: выход. */
export function IconLogout(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M15 16.5V19C15 20.1046 14.1046 21 13 21H6C4.89543 21 4 20.1046 4 19L4 5C4 3.89543 4.89543 3 6 3L13 3C14.1046 3 15 3.89543 15 5V7.5M9 12H20M17.5 9.5L20 12L17.5 14.5' />
		</IconBase>
	);
}

/** Шеврон вниз: раскрывающееся меню. */
export function IconChevronDown(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M19 9L12.7071 15.2929C12.3166 15.6834 11.6834 15.6834 11.2929 15.2929L5 9' />
		</IconBase>
	);
}

/** Плюс: добавить. */
export function IconPlus(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M12 5.25V18.75M5.25 12H18.75' />
		</IconBase>
	);
}

/** Карандаш: изменить. */
export function IconPencil(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M4 20L4.75 16.25L15.5 5.5C16.3284 4.67157 17.6716 4.67157 18.5 5.5C19.3284 6.32843 19.3284 7.67157 18.5 8.5L7.75 19.25L4 20ZM13.5 7.5L16.5 10.5' />
		</IconBase>
	);
}

/** Корзина: удалить. */
export function IconTrash(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M5 7.5H19M10 11V16M14 11V16M6.5 7.5L7.2 17.6C7.28 18.7 8.2 19.5 9.29 19.5H14.71C15.8 19.5 16.72 18.7 16.8 17.6L17.5 7.5M9.5 7.5V5.5C9.5 4.95 9.95 4.5 10.5 4.5H13.5C14.05 4.5 14.5 4.95 14.5 5.5V7.5' />
		</IconBase>
	);
}

/** Три точки: меню действий строки. */
export function IconDots(props: IconProps) {
	return (
		<IconBase {...props}>
			<circle cx='5.5' cy='12' r='1.6' fill='currentColor' stroke='none' />
			<circle cx='12' cy='12' r='1.6' fill='currentColor' stroke='none' />
			<circle cx='18.5' cy='12' r='1.6' fill='currentColor' stroke='none' />
		</IconBase>
	);
}

/** Кнопка питания: включить или отключить доступ. */
export function IconPower(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M12 4.5V11.25M7.4 7.05A6.75 6.75 0 1 0 16.6 7.05' />
		</IconBase>
	);
}

/** Календарь. */
export function IconCalendar(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M8 3V6M16 3V6M4.5 9.5H19.5M6.5 5H17.5C18.6046 5 19.5 5.89543 19.5 7V18.5C19.5 19.6046 18.6046 20.5 17.5 20.5H6.5C5.39543 20.5 4.5 19.6046 4.5 18.5V7C4.5 5.89543 5.39543 5 6.5 5Z' />
		</IconBase>
	);
}

/** Календарь с галочкой: оплачено в выбранный день. */
export function IconCalendarCheck(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M8 3V6M16 3V6M4.5 9.5H19.5M6.5 5H17.5C18.6046 5 19.5 5.89543 19.5 7V18.5C19.5 19.6046 18.6046 20.5 17.5 20.5H6.5C5.39543 20.5 4.5 19.6046 4.5 18.5V7C4.5 5.89543 5.39543 5 6.5 5ZM9 15L11 17L15 13' />
		</IconBase>
	);
}

/** Стрелка назад по дуге: отменить. */
export function IconUndo(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M9 14L4.5 9.5L9 5M4.5 9.5H15C17.4853 9.5 19.5 11.5147 19.5 14C19.5 16.4853 17.4853 18.5 15 18.5H12' />
		</IconBase>
	);
}

/** Угол влево. */
export function IconChevronLeft(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M15 6L9 12L15 18' />
		</IconBase>
	);
}

/** Угол вправо. */
export function IconChevronRight(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M9 6L15 12L9 18' />
		</IconBase>
	);
}

/** Крест: закрыть или сбросить. */
export function IconClose(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M18 6L6 18M6 6L18 18' />
		</IconBase>
	);
}

/** Стрелка по кругу: повторить. */
export function IconRefresh(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M19.5 12C19.5 16.1421 16.1421 19.5 12 19.5C7.85786 19.5 4.5 16.1421 4.5 12C4.5 7.85786 7.85786 4.5 12 4.5C14.6 4.5 16.9 5.8 18.2 7.8M18.5 4V8H14.5' />
		</IconBase>
	);
}

/** Стрелка вверх: сортировка по убыванию. */
export function IconArrowUp(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M12 19V5M7 10L12 5L17 10' />
		</IconBase>
	);
}

/** Стрелка вниз: сортировка по возрастанию. */
export function IconArrowDown(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M12 5V19M7 14L12 19L17 14' />
		</IconBase>
	);
}

/** Стрелка из квадрата: ссылка откроется в новой вкладке. */
export function IconExternalLink(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M13.5 4.5H19.5V10.5M19.25 4.75L11.5 12.5M10.5 5.5H7C5.89543 5.5 5 6.39543 5 7.5V17C5 18.1046 5.89543 19 7 19H16.5C17.6046 19 18.5 18.1046 18.5 17V13.5' />
		</IconBase>
	);
}

/** Круг с чертой: прекратить платёж. */
export function IconBan(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M5.64 5.64L18.36 18.36M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z' />
		</IconBase>
	);
}

/** Таблица: вид списком. */
export function IconTable(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M4 6A2 2 0 0 1 6 4H18A2 2 0 0 1 20 6V18A2 2 0 0 1 18 20H6A2 2 0 0 1 4 18V6ZM4 10H20M10 10V20' />
		</IconBase>
	);
}

/** Кошелёк: бюджет. */
export function IconWallet(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M17 8V6.5A1.5 1.5 0 0 0 15.5 5H6A2 2 0 0 0 4 7M4 7A2 2 0 0 0 6 9H19A1 1 0 0 1 20 10V18A1 1 0 0 1 19 19H6A2 2 0 0 1 4 17V7ZM16 14H16.01' />
		</IconBase>
	);
}

/** Лист с часами: журнал действий. */
export function IconJournal(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M14 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H17C18.1046 3 19 3.89543 19 5V11M9 8H15M9 12H12M21 17.5C21 19.433 19.433 21 17.5 21C15.567 21 14 19.433 14 17.5C14 15.567 15.567 14 17.5 14C19.433 14 21 15.567 21 17.5ZM17.5 16V17.5L18.5 18.5' />
		</IconBase>
	);
}

/** Два листа: копировать. */
export function IconCopy(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M9 9.5A1.5 1.5 0 0 1 10.5 8H18.5A1.5 1.5 0 0 1 20 9.5V18.5A1.5 1.5 0 0 1 18.5 20H10.5A1.5 1.5 0 0 1 9 18.5V9.5ZM16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5V14.5A1.5 1.5 0 0 0 5.5 16H9' />
		</IconBase>
	);
}

/** Галочка: готово, скопировано. */
export function IconCheck(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M5 12.5L10 17.5L19 7' />
		</IconBase>
	);
}

/** Чек: лист с зубчатым краем и строками. */
export function IconReceipt(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M6 3.5H18V20.5L15.5 19L13 20.5L10.5 19L8 20.5L6 19V3.5ZM9 8H15M9 11.5H15M9 15H12.5' />
		</IconBase>
	);
}

/** Скрепка: приложить файл. */
export function IconPaperclip(props: IconProps) {
	return (
		<IconBase {...props}>
			<path d='M15.5 7.5L9.25 13.75A1.77 1.77 0 0 0 11.75 16.25L18.25 9.75A3.54 3.54 0 0 0 13.25 4.75L6.75 11.25A5.3 5.3 0 0 0 14.25 18.75L19.5 13.5' />
		</IconBase>
	);
}
