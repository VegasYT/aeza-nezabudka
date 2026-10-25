import { createFileRoute } from '@tanstack/react-router';

import { NotFoundPage } from '@pages/not-found';

// Любой неизвестный адрес попадает сюда: «не найдено» остаётся в каркасе и требует входа.
export const Route = createFileRoute('/_authenticated/$')({
	component: NotFoundPage,
});
