import { LoginForm } from '@features/sign-in';
import { AezaGlyph } from '@shared/ui/aeza-logo';
import { ColorSchemeToggle } from '@shared/ui/color-scheme-toggle';
import { Island } from '@shared/ui/island';
import { ProductBrand } from '@shared/ui/product-brand';

import classes from './login-page.module.css';

/** Страница входа: панель бренда и форма входа аккаунтом Aéza; `onSignedIn` ведёт дальше после входа. */
export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
	return (
		<div className={classes.page}>
			<div className={classes.panel}>
				<AezaGlyph className={classes.glyph} />
				<div aria-hidden className={classes.pattern}>
					<span className={`${classes.lineH} ${classes.h1}`} />
					<span className={`${classes.lineH} ${classes.h2}`} />
					<span className={`${classes.lineH} ${classes.h3}`} />
					<span className={classes.accent} />
					<span className={`${classes.lineV} ${classes.v1}`} />
					<span className={`${classes.lineV} ${classes.v2}`} />
					<span className={`${classes.lineV} ${classes.v3}`} />
				</div>
				<ProductBrand className={classes.brand} />
				<div className={classes.headline}>
					<p className={classes.headlineTitle}>
						Напоминания о&nbsp;регулярных платежах
					</p>
					<p className={classes.headlineText}>
						За&nbsp;три дня до&nbsp;срока напомним в&nbsp;Telegram, а&nbsp;здесь
						видно, что уже оплачено.
					</p>
				</div>
			</div>
			<div className={classes.content}>
				<div className={classes.tools}>
					<ColorSchemeToggle />
				</div>
				<main className={classes.main}>
					<Island className={classes.card}>
						<LoginForm onSignedIn={onSignedIn} />
					</Island>
				</main>
			</div>
		</div>
	);
}
