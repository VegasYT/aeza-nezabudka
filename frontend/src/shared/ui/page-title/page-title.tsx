import { Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import classes from './page-title.module.css';

/** Заголовок страницы на холсте: Exo 2 прописными, как заголовки брендбука; `note` - короткая подпись рядом. */
export function PageTitle({
	children,
	note,
}: {
	children: ReactNode;
	note?: ReactNode;
}) {
	const title = (
		<Title order={1} className={classes.title}>
			{children}
		</Title>
	);

	if (!note) {
		return title;
	}

	return (
		<div className={classes.heading}>
			{title}
			<Text size='sm' c='dimmed' className={classes.note}>
				{note}
			</Text>
		</div>
	);
}
