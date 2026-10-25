import type { ComponentPropsWithoutRef } from 'react';

import classes from './island.module.css';

/** Остров - рабочая зона страницы на холсте: свой фон, скругление, без рамки. */
export function Island({
	className,
	...props
}: ComponentPropsWithoutRef<'section'>) {
	return (
		<section
			className={className ? `${classes.island} ${className}` : classes.island}
			{...props}
		/>
	);
}
