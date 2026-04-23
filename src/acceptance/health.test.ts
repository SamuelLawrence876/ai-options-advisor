import type { HealthResponse } from '../models';

const apiUrl = process.env.API_URL?.replace(/\/$/, '');

if (!apiUrl) {
  throw new Error('API_URL environment variable is required');
}

describe('GET /health', () => {
  let response: Response;
  let body: HealthResponse;

  beforeAll(async () => {
    response = await fetch(`${apiUrl}/health`);
    body = (await response.json()) as HealthResponse;
  });

  it('returns HTTP 200', () => {
    expect(response.status).toBe(200);
  });

  it('reports status healthy', () => {
    expect(body.status).toBe('healthy');
  });

  it('includes service name and stage', () => {
    expect(typeof body.service).toBe('string');
    expect(body.service.length).toBeGreaterThan(0);
    expect(typeof body.stage).toBe('string');
    expect(body.stage.length).toBeGreaterThan(0);
  });
});
