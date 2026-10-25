import { encode } from 'uqr';

import classes from './notifications-page.module.css';

/** QR-код ссылки на бота: тёмные модули на белом в любой схеме, чтобы его читала любая камера. */
export function LinkQr({ url, label }: { url: string; label: string }) {
	const { data, size } = encode(url, { ecc: 'M', border: 2 });
	const modules = data
		.flatMap((row, y) =>
			row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : ''))
		)
		.join('');

	return (
		<figure className={classes.qr}>
			<svg
				viewBox={`0 0 ${size} ${size}`}
				role='img'
				aria-label={label}
				className={classes.qrCode}
			>
				<rect width={size} height={size} className={classes.qrLight} />
				<path d={modules} className={classes.qrDark} />
			</svg>
			<figcaption className={classes.qrCaption}>
				Чтобы открыть на&nbsp;телефоне, наведите камеру на&nbsp;код
			</figcaption>
		</figure>
	);
}
