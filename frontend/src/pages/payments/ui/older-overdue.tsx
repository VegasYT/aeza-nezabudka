import { Button } from '@mantine/core';

import { StatusMark } from '@entities/payment-occurrence';
import type { CurrencyTotals } from '@shared/api';
import { formatMoney } from '@shared/lib/money';

import { formatOverdueCount } from '../model/wording';
import classes from './payments-page.module.css';

/** Строка над списком: просрочка, оставшаяся раньше выбранного периода. */
export function OlderOverdue({
	total,
	currencies,
	before,
	onShow,
}: {
	total: number;
	currencies: CurrencyTotals[];
	before: string;
	onShow: () => void;
}) {
	const sums = currencies
		.map(({ overdueMinor, currency }) => formatMoney(overdueMinor, currency))
		.join(', ');

	return (
		<div role='status' className={classes.older}>
			<StatusMark tone='overdue' />
			<span className={classes.olderText}>
				Ещё {formatOverdueCount(total)} {before}
				{sums && `: ${sums}`}
			</span>
			<Button size='compact-sm' variant='default' onClick={onShow}>
				Показать
			</Button>
		</div>
	);
}
