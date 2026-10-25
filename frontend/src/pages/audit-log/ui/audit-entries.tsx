import { Popover, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';

import type { Department } from '@shared/api';
import { formatTimeOfDay } from '@shared/lib/dates';

import type { EntryDay } from '../lib/days';
import { describeEntry, type EntryDetail } from '../lib/describe-entry';
import classes from './audit-log-page.module.css';
import { EntryIcon } from './entry-icon';

interface EntriesProps {
	days: EntryDay[];
	departments: Department[] | undefined;
}

function Dash() {
	return <span className={classes.dash}>—</span>;
}

const lineText = (line: EntryDetail) =>
	typeof line === 'string' ? line : line.text;

// Наведения на телефоне нет, поэтому в карточках полный текст открывается нажатием.
function DetailLine({
	line,
	tap = false,
}: {
	line: EntryDetail;
	tap?: boolean;
}) {
	if (typeof line === 'string') {
		return line;
	}

	if (tap) {
		return (
			<Popover position='bottom-start' width={280}>
				<Popover.Target>
					<UnstyledButton className={classes.hintButton}>
						{line.text}
					</UnstyledButton>
				</Popover.Target>
				<Popover.Dropdown fz='xs' className={classes.hintText}>
					{line.hint}
				</Popover.Dropdown>
			</Popover>
		);
	}

	return (
		<Tooltip
			label={line.hint}
			multiline
			maw={320}
			classNames={{ tooltip: classes.hintText }}
			events={{ hover: true, focus: true, touch: false }}
		>
			<span tabIndex={0} className={classes.hint}>
				{line.text}
			</span>
		</Tooltip>
	);
}

/** Таблица записей по дням: время, кто, действие, объект, подробности. */
export function EntriesTable({ days, departments }: EntriesProps) {
	return (
		<div className={classes.tableBox}>
			<Table className={classes.table} verticalSpacing='sm'>
				<Table.Thead>
					<Table.Tr>
						<Table.Th className={classes.timeColumn}>Время</Table.Th>
						<Table.Th>Кто</Table.Th>
						<Table.Th>Действие</Table.Th>
						<Table.Th>Объект</Table.Th>
						<Table.Th>Подробности</Table.Th>
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{days.map((day) => [
						<Table.Tr key={day.day}>
							<Table.Th scope='colgroup' colSpan={5} className={classes.day}>
								{day.title}
							</Table.Th>
						</Table.Tr>,
						...day.entries.map((entry) => {
							const view = describeEntry(entry, departments);

							return (
								<Table.Tr key={entry.id}>
									<Table.Td className={classes.time}>
										{formatTimeOfDay(entry.at)}
									</Table.Td>
									<Table.Td className={classes.actor}>
										{entry.actorLogin}
									</Table.Td>
									<Table.Td>
										<span className={classes.action}>
											<EntryIcon kind={view.kind} />
											{view.action}
										</span>
									</Table.Td>
									<Table.Td>
										{view.object ? (
											<div className={classes.object}>
												<span>{view.object}</span>
												{view.objectNote && (
													<Text
														size='xs'
														c='dimmed'
														className={classes.numbers}
													>
														{view.objectNote}
													</Text>
												)}
											</div>
										) : (
											<Dash />
										)}
									</Table.Td>
									<Table.Td className={classes.details}>
										{view.details.length > 0 ? (
											view.details.map((line) => (
												<div key={lineText(line)}>
													<DetailLine line={line} />
												</div>
											))
										) : (
											<Dash />
										)}
									</Table.Td>
								</Table.Tr>
							);
						}),
					])}
				</Table.Tbody>
			</Table>
		</div>
	);
}

/** Карточки записей на телефоне: действие и время, объект, подробности, автор. */
export function EntriesCards({ days, departments }: EntriesProps) {
	return (
		<div>
			{days.map((day) => (
				<section key={day.day} aria-label={day.title}>
					<h2 className={classes.cardsDay}>{day.title}</h2>
					<ul className={classes.cards}>
						{day.entries.map((entry) => {
							const view = describeEntry(entry, departments);

							return (
								<li key={entry.id} className={classes.card}>
									<EntryIcon kind={view.kind} size={20} />
									<div className={classes.cardText}>
										<span className={classes.cardHead}>
											<span className={classes.cardAction}>{view.action}</span>
											<span className={classes.time}>
												{formatTimeOfDay(entry.at)}
											</span>
										</span>
										{view.object && (
											<span>
												{view.objectNote
													? `${view.object}, ${view.objectNote}`
													: view.object}
											</span>
										)}
										{view.details.map((line) => (
											<span key={lineText(line)} className={classes.details}>
												<DetailLine line={line} tap />
											</span>
										))}
										<span className={classes.cardActor}>
											{entry.actorLogin}
										</span>
									</div>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}
