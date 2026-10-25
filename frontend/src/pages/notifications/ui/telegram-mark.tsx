/** Вид значка статуса: не подключено, подключено, бот заблокирован или удалён. */
export type MarkTone = 'off' | 'on' | 'blocked';

const FILL: Record<MarkTone, [string, string]> = {
	off: ['var(--nz-status-waiting)', 'var(--nz-on-status-waiting)'],
	on: ['var(--nz-status-paid)', 'var(--nz-on-status-paid)'],
	blocked: ['var(--nz-status-overdue)', 'var(--nz-on-status-overdue)'],
};

/** Значок статуса Telegram: цвет и форма вместе, чтобы статус различался не только цветом. */
export function TelegramMark({
	tone,
	size = 18,
}: {
	tone: MarkTone;
	size?: number;
}) {
	const [fill, ink] = FILL[tone];

	return (
		<svg width={size} height={size} viewBox='0 0 20 20' aria-hidden='true'>
			<circle cx='10' cy='10' r='9' fill={fill} />
			{tone === 'off' && (
				<path
					d='M6.3 10h7.4'
					fill='none'
					stroke={ink}
					strokeWidth='2.2'
					strokeLinecap='round'
				/>
			)}
			{tone === 'on' && (
				<path
					d='M6 10.4l2.7 2.7l5.3-5.7'
					fill='none'
					stroke={ink}
					strokeWidth='2.2'
					strokeLinecap='round'
					strokeLinejoin='round'
				/>
			)}
			{tone === 'blocked' && (
				<>
					<path
						d='M10 5.4v5.3'
						fill='none'
						stroke={ink}
						strokeWidth='2.2'
						strokeLinecap='round'
					/>
					<circle cx='10' cy='14.1' r='1.3' fill={ink} />
				</>
			)}
		</svg>
	);
}
