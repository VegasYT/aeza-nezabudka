import { createFileRoute } from '@tanstack/react-router';

import { AuditLogPage, validateAuditSearch } from '@pages/audit-log';

export const Route = createFileRoute('/_authenticated/_admin/audit')({
	validateSearch: validateAuditSearch,
	component: AuditLogPage,
});
