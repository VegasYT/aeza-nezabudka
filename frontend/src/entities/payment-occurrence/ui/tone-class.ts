import type { StatusTone } from '../model/occurrence-status';
import classes from './status-tone.module.css';

/** Цвет подписи статуса по его виду. */
export const TONE_CLASS: Record<StatusTone, string | undefined> = {
	paid: classes.tonePaid,
	late: classes.toneLate,
	overdue: classes.toneOverdue,
	soon: classes.toneSoon,
	waiting: classes.toneWaiting,
};
