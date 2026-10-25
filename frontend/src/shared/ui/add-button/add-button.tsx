import { ActionIcon, Button } from '@mantine/core';

import { usePhone } from '@shared/lib/media';
import { IconPlus } from '@shared/ui/icons';

/** «Добавить …» в шапке раздела; на телефоне - квадратная кнопка «+» в строке заголовка, подпись остаётся доступным именем. */
export function AddButton({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}) {
	const phone = usePhone();

	return phone ? (
		<ActionIcon
			size='lg'
			radius='md'
			aria-label={label}
			title={label}
			onClick={onClick}
		>
			<IconPlus size={22} />
		</ActionIcon>
	) : (
		<Button leftSection={<IconPlus size={18} />} onClick={onClick}>
			{label}
		</Button>
	);
}
