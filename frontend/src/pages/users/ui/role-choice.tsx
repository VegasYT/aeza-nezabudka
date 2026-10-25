import { Radio, Stack, Text } from '@mantine/core';

import type { MemberRole } from '@shared/api';

import classes from './users-page.module.css';

const choices: { role: MemberRole; title: string; text: string }[] = [
	{
		role: 'user',
		title: 'Пользователь',
		text: 'Входит в\u00a0панель, видит все платежи и\u00a0отмечает оплату',
	},
	{
		role: 'integration',
		title: 'Интеграция',
		text: 'Для других систем: работает через API по\u00a0ключу X-API-KEY, в\u00a0панель не\u00a0входит',
	},
];

interface RoleChoiceProps {
	value: MemberRole;
	onChange: (role: MemberRole) => void;
	/** Роль участника сейчас: её карточка помечена «сейчас». */
	current?: MemberRole;
}

/** Выбор роли участника карточками: «Пользователь» или «Интеграция». */
export function RoleChoice({ value, onChange, current }: RoleChoiceProps) {
	return (
		<Radio.Group
			label='Роль'
			value={value}
			onChange={(next) => onChange(next as MemberRole)}
		>
			<Stack gap='xs' mt={6}>
				{choices.map((choice) => (
					<Radio.Card
						key={choice.role}
						value={choice.role}
						className={classes.roleCard}
					>
						<Radio.Indicator mt={2} />
						<Stack gap={3}>
							<span className={classes.roleTitle}>
								{choice.title}
								{choice.role === current && (
									<span className={classes.roleNow}>сейчас</span>
								)}
							</span>
							<Text size='sm' c='dimmed'>
								{choice.text}
							</Text>
						</Stack>
					</Radio.Card>
				))}
			</Stack>
		</Radio.Group>
	);
}
