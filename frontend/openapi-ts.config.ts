import { defineConfig } from '@hey-api/openapi-ts';

// Клиент API генерируется из контракта backend; результат коммитится, как routeTree.gen.ts.
export default defineConfig({
	input: '../backend/api/openapi.yaml',
	output: 'src/shared/api/generated',
	parser: {
		patch: {
			operations: {
				// Из `use_challenge` вышла бы функция useChallenge, которую правила хуков и React Compiler примут за хук.
				'POST /api/v1/auth/use-challenge': (operation) => {
					operation.operationId = 'exchange_challenge';
				},
			},
		},
	},
	plugins: [
		'@hey-api/client-axios',
		'@hey-api/typescript',
		'@hey-api/sdk',
		'@tanstack/react-query',
		'msw',
	],
});
