/// <reference types="vitest/config" />
import babel from '@rolldown/plugin-babel';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	// Только переменные dev-сервера: в бандл попадают лишь VITE_*, а API_* остаются здесь.
	// Переменная окружения при запуске перебивает значение из .env.local.
	const env = loadEnv(mode, import.meta.dirname, 'API_');

	return {
		plugins: [
			// Плагин роутера идёт до react(), иначе генерация маршрутов молча не работает.
			tanstackRouter({
				target: 'react',
				// В тестах страницы грузятся сразу, без отдельных чанков.
				autoCodeSplitting: mode !== 'test',
				routesDirectory: './src/app/routes',
				generatedRouteTree: './src/app/routeTree.gen.ts',
			}),
			react(),
			babel({ presets: [reactCompilerPreset()] }),
		],
		resolve: {
			tsconfigPaths: true,
		},
		server: {
			proxy: {
				// Панель и API на одном домене, как за Caddy в compose: CORS не нужен.
				'/api': env.API_PROXY_TARGET || 'http://localhost:8000',
			},
		},
		test: {
			environment: 'jsdom',
			setupFiles: ['./vitest.setup.ts'],
			// Сценарии через всё приложение с вводом в форму при параллельном прогоне идут дольше 5 секунд.
			testTimeout: 15_000,
			unstubGlobals: true,
			mockReset: true,
			unstubEnvs: true,
		},
	};
});
