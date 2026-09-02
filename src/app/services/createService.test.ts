import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createService } from './createService';

// Mock env functions
vi.mock('./env', () => ({
  isTauriEnv: vi.fn(() => false),
  shouldTryBackend: vi.fn(() => false),
  getApiBase: vi.fn(() => 'http://127.0.0.1:8000/api'),
}));

// Mock fetch
global.fetch = vi.fn();

describe('createService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.warn = vi.fn();
  });

  describe('3-tier fallback pattern', () => {
    it('returns mock data when backend is not attempted', async () => {
      const mockData = { name: 'test', value: 42 };
      const service = createService({
        backendPath: '/test',
        mockData,
      });

      const result = await service();
      expect(result).toEqual(mockData);
    });

    it('returns backend response when backend succeeds', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'backend', value: 100 }),
      });

      const mockData = { name: 'mock', value: 0 };
      const service = createService({
        backendPath: '/test',
        mockData,
        alwaysTryBackend: true,
      });

      const result = await service();
      expect(result).toEqual({ name: 'backend', value: 100 });
    });

    it('falls through to mock when backend fails', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const mockData = { name: 'fallback', value: -1 };
      const service = createService({
        backendPath: '/test',
        mockData,
        alwaysTryBackend: true,
        label: 'test.service',
      });

      const result = await service();
      expect(result).toEqual(mockData);
      expect(console.warn).toHaveBeenCalled();
    });

    it('uses liveFetcher when provided and backend fails', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Backend unavailable'));
      
      const liveData = { name: 'live', value: 50 };
      const service = createService({
        backendPath: '/test',
        liveFetcher: async () => liveData,
        mockData: { name: 'mock', value: 0 },
        alwaysTryBackend: true,
      });

      const result = await service();
      expect(result).toEqual(liveData);
    });

    it('falls to mock when liveFetcher returns null', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Backend unavailable'));
      
      const service = createService({
        backendPath: '/test',
        liveFetcher: async () => null,
        mockData: { name: 'fallback', value: 999 },
        alwaysTryBackend: true,
      });

      const result = await service();
      expect(result).toEqual({ name: 'fallback', value: 999 });
    });

    it('calls onResolve callback with metadata', async () => {
      const onResolve = vi.fn();
      const mockData = { name: 'test' };
      const service = createService({
        backendPath: '/test',
        mockData,
        onResolve,
      });

      await service();
      expect(onResolve).toHaveBeenCalled();
      const meta = onResolve.mock.calls[0][0];
      expect(meta.source).toBe('mock');
      expect(meta.resolvedAt).toBeDefined();
      expect(meta.latencyMs).toBeTypeOf('number');
    });

    it('applies transform to backend response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ raw: 'data' }),
      });

      const service = createService({
        backendPath: '/test',
        mockData: { transformed: false, value: undefined },
        transform: (raw: any) => ({ transformed: true, value: raw.raw }),
        alwaysTryBackend: true,
      });

      const result = await service();
      expect(result).toEqual({ transformed: true, value: 'data' });
    });
  });
});
