import { Anchor, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';

import { Island } from '@shared/ui/island';
import { PageTitle } from '@shared/ui/page-title';

import classes from './forbidden-page.module.css';

/** Раздел администратора, открытый пользователем по прямому адресу; ведёт к платежам. */
export function ForbiddenPage({ section }: { section?: string }) {
	return (
		<>
			<PageTitle>Нет доступа</PageTitle>
			<Island className={classes.island}>
				<Text c='dimmed'>
					{section ? `Раздел «${section}»` : 'Этот раздел'} доступен только
					администраторам.
				</Text>
				<Anchor
					fw={600}
					renderRoot={(props) => <Link to='/payments' {...props} />}
				>
					Перейти к платежам
				</Anchor>
			</Island>
		</>
	);
}
