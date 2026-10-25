import {
	createFileRoute,
	ErrorComponent,
	type ErrorComponentProps,
	useLocation,
} from '@tanstack/react-router';

import { ForbiddenPage } from '@pages/forbidden';
import { currentUserOptions } from '@shared/auth';

import { sections } from '../../layout/sections';

class ForbiddenError extends Error {}

export const Route = createFileRoute('/_authenticated/_admin')({
	// Роль проверяется до загрузчиков разделов: пользователь не получает 403 от их запросов.
	beforeLoad: async ({ context }) => {
		const user =
			await context.queryClient.ensureQueryData(currentUserOptions());

		if (user.role !== 'admin') {
			throw new ForbiddenError();
		}
	},
	errorComponent: AdminError,
});

// Адрес не меняется: пользователь видит «Нет доступа» там, куда пришёл. Права всё равно проверяет сервер.
function AdminError(props: ErrorComponentProps) {
	const { pathname } = useLocation();

	if (!(props.error instanceof ForbiddenError)) {
		return <ErrorComponent {...props} />;
	}

	const section = sections.find(
		({ to }) => pathname === to || pathname.startsWith(`${to}/`)
	);

	return <ForbiddenPage section={section?.label} />;
}
