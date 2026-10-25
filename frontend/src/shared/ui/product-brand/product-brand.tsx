import { AezaLogo, AezaMark } from '@shared/ui/aeza-logo';

import classes from './product-brand.module.css';

/** Логотип Aéza со ссылкой на aeza.ru и название «Незабудка»; `compact` - знак «é» вместо полного логотипа. */
export function ProductBrand({
	compact = false,
	className,
}: {
	compact?: boolean;
	className?: string;
}) {
	return (
		<div
			className={className ? `${classes.brand} ${className}` : classes.brand}
		>
			<a
				href='https://aeza.ru'
				target='_blank'
				rel='noreferrer'
				className={classes.link}
			>
				{compact ? <AezaMark /> : <AezaLogo />}
			</a>
			{!compact && <span aria-hidden className={classes.divider} />}
			<span className={classes.name}>Незабудка</span>
		</div>
	);
}
