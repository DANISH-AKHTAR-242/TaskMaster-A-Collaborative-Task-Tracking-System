import { Router } from 'express';

export function healthRoutes(checkReadiness: () => Promise<unknown>): Router {
  const router = Router();
  router.get('/live', (_request, response) => response.json({ data: { status: 'ok' } }));
  router.get('/ready', async (_request, response) => {
    await checkReadiness();
    response.json({ data: { status: 'ready' } });
  });
  return router;
}
