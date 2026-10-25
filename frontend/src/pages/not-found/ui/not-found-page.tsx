import { Anchor, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';

import { Island } from '@shared/ui/island';
import { PageTitle } from '@shared/ui/page-title';

import classes from './not-found-page.module.css';

/** Страница для адреса, которого нет среди разделов; ведёт обратно к платежам. */
export function NotFoundPage() {
	return (
		<>
			<PageTitle>Страница не найдена</PageTitle>
			<Island className={classes.island}>
				<Text c='dimmed'>
					Такого адреса нет. Проверьте ссылку или вернитесь к&nbsp;платежам.
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
