import { Tooltip } from '@mantine/core';
import { Link, Outlet } from '@tanstack/react-router';
import { Fragment } from 'react';

import { useCurrentUser } from '@shared/auth';
import { ProductBrand } from '@shared/ui/product-brand';

import { AccountMenu } from './account-menu';
import classes from './app-layout.module.css';
import { type Section, sections } from './sections';
import { useNavMode } from './use-nav-mode';

function HeaderNav({
	items,
	compact,
}: {
	items: readonly Section[];
	compact: boolean;
}) {
	return (
		<nav aria-label='Разделы' className={classes.nav}>
			{items.map(({ to, label, icon: SectionIcon, adminOnly }, index) => (
				<Fragment key={to}>
					{adminOnly && !items[index - 1]?.adminOnly && (
						<span aria-hidden className={classes.navDivider} />
					)}
					{compact ? (
						<Tooltip
							label={label}
							events={{ hover: true, focus: true, touch: false }}
						>
							<Link to={to} aria-label={label} className={classes.navIcon}>
								<SectionIcon size={22} />
							</Link>
						</Tooltip>
					) : (
						<Link to={to} className={classes.navItem}>
							<SectionIcon size={20} />
							<span className={classes.navLabel} data-label={label}>
								{label}
							</span>
						</Link>
					)}
				</Fragment>
			))}
		</nav>
	);
}

function BottomNav({ items }: { items: readonly Section[] }) {
	return (
		<nav aria-label='Разделы' className={classes.bottomNav}>
			{items.map(({ to, label, icon: SectionIcon }) => (
				<Link key={to} to={to} aria-label={label} className={classes.tab}>
					<SectionIcon size={26} />
				</Link>
			))}
		</nav>
	);
}

/** Каркас веб-панели: шапка на холсте с логотипом и навигацией, острова страницы и нижняя панель на телефоне. */
export function AppLayout() {
	const navMode = useNavMode();
	const phone = navMode === 'bar';
	const isAdmin = useCurrentUser()?.role === 'admin';
	// Скрытый раздел - удобство, а не защита: права проверяет сервер.
	const items = sections.filter(({ adminOnly }) => isAdmin || !adminOnly);

	return (
		<div className={classes.layout}>
			<header className={classes.header}>
				<ProductBrand compact={phone} />
				{!phone && <HeaderNav items={items} compact={navMode === 'compact'} />}
				<div className={classes.tools}>
					<AccountMenu />
				</div>
			</header>
			<main className={classes.main}>
				<Outlet />
			</main>
			{phone && <BottomNav items={items} />}
		</div>
	);
}
