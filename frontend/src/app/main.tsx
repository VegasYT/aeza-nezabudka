import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { connectApiClient, connectTabs } from '@shared/auth';
import { ThemeRoot } from '@shared/ui/theme';

import { createQueryClient } from './query-client';
import { createAppRouter } from './router';

const rootElement = document.getElementById('root');

if (!rootElement) {
	throw new Error('Не найден элемент #root');
}

connectApiClient();
connectTabs();

const router = createAppRouter({ queryClient: createQueryClient() });

createRoot(rootElement).render(
	<StrictMode>
		<ThemeRoot>
			<RouterProvider router={router} />
		</ThemeRoot>
	</StrictMode>
);
