import { createFileRoute } from '@tanstack/react-router';

import { DepartmentsPage } from '@pages/departments';

export const Route = createFileRoute('/_authenticated/_admin/departments')({
	component: DepartmentsPage,
});
