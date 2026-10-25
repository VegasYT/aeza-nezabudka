import type { ComponentType, SVGProps } from 'react';

/** Свойства значка: размер в пикселях и атрибуты SVG; по умолчанию значок скрыт от вспомогательных технологий. */
export interface IconProps extends SVGProps<SVGSVGElement> {
	size?: number | string;
}

/** Значок из набора `@shared/ui/icons`, например для списка разделов. */
export type AppIcon = ComponentType<IconProps>;

/** Общая обёртка значков: сетка 24 px, линия 1.5, скруглённые концы и углы, цвет текста. */
export function IconBase({ size = 24, children, ...props }: IconProps) {
	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width={size}
			height={size}
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth={1.5}
			strokeLinecap='round'
			strokeLinejoin='round'
			aria-hidden
			{...props}
		>
			{children}
		</svg>
	);
}
