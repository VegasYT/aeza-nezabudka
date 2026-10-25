import type { User } from '@shared/api';
import { formatMomentTime } from '@shared/lib/dates';

/** Последняя активность участника или пояснение, что её ещё не было. */
export function activityLabel(
	member: Pick<User, 'lastSeenAt' | 'role'>,
	timeZone?: string
) {
	if (member.lastSeenAt) {
		return formatMomentTime(member.lastSeenAt, timeZone);
	}

	return member.role === 'integration'
		? 'Запросов ещё не\u00a0было'
		: 'Входа ещё не\u00a0было';
}
