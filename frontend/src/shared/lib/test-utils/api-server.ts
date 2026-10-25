import { setupServer } from 'msw/node';

/** Подмена API в тестах: ответы задаются обработчиками `handleXxx` через `apiServer.use(...)`. */
export const apiServer = setupServer();
