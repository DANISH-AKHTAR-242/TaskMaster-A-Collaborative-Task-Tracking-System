import express from 'express';
import request from 'supertest';
import { healthRoutes } from './routes.js';

describe('health routes', () => {
  it('reports liveness', async () => {
    const app = express().use(
      '/health',
      healthRoutes(() => Promise.resolve([1])),
    );
    await request(app)
      .get('/health/live')
      .expect(200, { data: { status: 'ok' } });
  });

  it('checks the database for readiness', async () => {
    const query = vi.fn(() => Promise.resolve([1]));
    const app = express().use('/health', healthRoutes(query));
    await request(app)
      .get('/health/ready')
      .expect(200, { data: { status: 'ready' } });
    expect(query).toHaveBeenCalledOnce();
  });
});
