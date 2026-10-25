import type { StatusTone } from '../model/occurrence-status';

const FILL: Record<StatusTone, [string, string]> = {
	paid: ['var(--nz-status-paid)', 'var(--nz-on-status-paid)'],
	late: ['var(--nz-status-paid)', 'var(--nz-on-status-paid)'],
	overdue: ['var(--nz-status-overdue)', 'var(--nz-on-status-overdue)'],
	soon: ['var(--nz-status-soon)', 'var(--nz-on-status-soon)'],
	waiting: ['var(--nz-status-waiting)', 'var(--nz-on-status-waiting)'],
};

/** Значок статуса периода: цвет и форма вместе, чтобы статус различался не только цветом. */
export function StatusMark({ tone }: { tone: StatusTone }) {
	const [fill, ink] = FILL[tone];

	return (
		<svg width='18' height='18' viewBox='0 0 20 20' aria-hidden='true'>
			<circle cx='10' cy='10' r='9' fill={fill} />
			{(tone === 'paid' || tone === 'late') && (
				<path
					d='M6 10.4l2.7 2.7l5.3-5.7'
					fill='none'
					stroke={ink}
					strokeWidth='2.2'
					strokeLinecap='round'
					strokeLinejoin='round'
				/>
			)}
			{tone === 'overdue' && (
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
			{tone === 'soon' && (
				<path
					d='M10 4.6a.9.9 0 0 1 .9.9v.4a3.7 3.7 0 0 1 2.8 3.6v1.9l.9 1.4a.5.5 0 0 1-.4.8H5.8a.5.5 0 0 1-.4-.8l.9-1.4V9.5a3.7 3.7 0 0 1 2.8-3.6v-.4a.9.9 0 0 1 .9-.9zM8.6 14.1h2.8a1.4 1.4 0 0 1-2.8 0z'
					fill={ink}
				/>
			)}
			{tone === 'waiting' && (
				<path
					d='M10 5.8v4.4l2.8 1.7'
					fill='none'
					stroke={ink}
					strokeWidth='1.9'
					strokeLinecap='round'
					strokeLinejoin='round'
				/>
			)}
		</svg>
	);
}
