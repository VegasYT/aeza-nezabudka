import { Skeleton } from '@mantine/core';

import type { Currency, CurrencyTotals } from '@shared/api';
import { formatMoney } from '@shared/lib/money';
import { Island } from '@shared/ui/island';

import { formatPeriods } from '../model/wording';
import classes from './payments-page.module.css';

const CURRENCIES: { code: Currency; title: string }[] = [
	{ code: 'RUB', title: 'рубли' },
	{ code: 'USD', title: 'доллары' },
	{ code: 'EUR', title: 'евро' },
];

function Card({
	code,
	title,
	totals,
	selected,
	phrase,
}: {
	code: Currency;
	title: string;
	totals: CurrencyTotals | undefined;
	selected: boolean;
	phrase: string;
}) {
	// Плановые периоды приходят с includePlanned, если у периода есть конец; иначе их ноль.
	const planned = totals?.plannedCount ?? 0;
	const plannedMinor = totals?.plannedMinor ?? 0;
	const count = (totals?.count ?? 0) + planned;
	const className = selected
		? `${classes.card} ${classes.cardSelected}`
		: classes.card;

	if (!totals || count === 0) {
		return (
			<Island className={className} aria-label={`${code}: нет периодов`}>
				<div className={classes.cardHead}>
					<span className={classes.code}>{code}</span>
					<span className={classes.muted}>{title}</span>
				</div>
				<span className={classes.muted}>Нет периодов {phrase}</span>
			</Island>
		);
	}

	const unpaid = totals.unpaidMinor + plannedMinor;
	const upcoming = unpaid - totals.overdueMinor;
	const countLabel =
		planned === 0
			? formatPeriods(count)
			: planned === count
				? `${formatPeriods(count)} по\u00a0расписанию`
				: `${formatPeriods(count)}, ${planned}\u00a0по\u00a0расписанию`;
	const legend = [
		{ label: 'Оплачено', value: totals.paidMinor, tone: classes.paid },
		{ label: 'Просрочено', value: totals.overdueMinor, tone: classes.overdue },
		{ label: 'Предстоит', value: upcoming, tone: classes.waiting },
	];

	return (
		<Island className={className} aria-label={`Итоги ${code}`}>
			<div className={classes.cardHead}>
				<span>
					<span className={classes.code}>{code}</span>{' '}
					<span className={classes.muted}>{title}</span>
				</span>
				<span className={classes.muted}>{countLabel}</span>
			</div>
			<div>
				<div className={classes.muted}>К оплате</div>
				<span className={classes.left}>{formatMoney(unpaid, code)}</span>{' '}
				<span className={classes.muted}>
					из {formatMoney(totals.totalMinor + plannedMinor, code)}
				</span>
			</div>
			<div className={classes.bar} aria-hidden='true'>
				{legend.map(({ label, value, tone }) =>
					value > 0 ? (
						<span
							key={label}
							className={tone}
							style={{ flex: `${value} 1 0` }}
						/>
					) : null
				)}
			</div>
			<div className={classes.legend}>
				{legend.map(({ label, value, tone }) => (
					<span key={label} className={classes.legendItem}>
						<span className={`${classes.dot} ${tone}`} aria-hidden='true' />
						{label}{' '}
						<span className={value > 0 ? classes.amount : classes.zero}>
							{formatMoney(value, code)}
						</span>
					</span>
				))}
			</div>
		</Island>
	);
}

/** Итоги за период по каждой валюте отдельно; выбранная в фильтре валюта выделена. */
export function SummaryCards({
	currencies,
	loading,
	selected,
	phrase,
}: {
	currencies: CurrencyTotals[] | undefined;
	loading: boolean;
	selected: Currency | undefined;
	phrase: string;
}) {
	return (
		<section aria-label='Итоги по валютам' className={classes.cards}>
			{CURRENCIES.map(({ code, title }) =>
				loading ? (
					<Island key={code} className={classes.card}>
						<Skeleton height={12} width={70} />
						<Skeleton height={28} width='58%' />
						<Skeleton height={6} />
					</Island>
				) : (
					<Card
						key={code}
						code={code}
						title={title}
						totals={currencies?.find((totals) => totals.currency === code)}
						selected={selected === code}
						phrase={phrase}
					/>
				)
			)}
		</section>
	);
}
