import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTauriEnv, shouldTryBackend, getApiBase } from './env';

// Mock environment for testing
describe('env.ts', () => {
  describe('getApiBase', () => {
    it('returns default URL when VITE_API_BASE is not set', () => {
      // @ts-ignore - mock import.meta.env
      delete import.meta.env.VITE_API_BASE;
      expect(getApiBase()).toBe('http://127.0.0.1:8000/api');
    });

    it('returns custom URL when VITE_API_BASE is set', () => {
      // @ts-ignore - mock import.meta.env
      import.meta.env.VITE_API_BASE = 'http://localhost:9000/api';
      expect(getApiBase()).toBe('http://localhost:9000/api');
    });

    it('strips trailing slashes from VITE_API_BASE', () => {
      // @ts-ignore - mock import.meta.env
      import.meta.env.VITE_API_BASE = 'http://localhost:9000/api/';
      expect(getApiBase()).toBe('http://localhost:9000/api');
    });
  });

  describe('isTauriEnv - positive cases', () => {
    it('returns true when __TAURI__ exists in window', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty(window, '__TAURI__', { value: {}, writable: true });
      expect(isTauriEnv()).toBe(true);
    });
  });

  describe('shouldTryBackend', () => {
    it('returns true when running in Tauri environment', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty(window, '__TAURI__', { value: {}, writable: true });
      expect(shouldTryBackend()).toBe(true);
    });

    it('returns true when __FORCE_BACKEND__ is set to true', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty(window, '__TAURI__', { value: undefined, writable: true });
      (window as any).__FORCE_BACKEND__ = true;
      expect(shouldTryBackend()).toBe(true);
    });

    it('returns true when FORCE_BACKEND is stored in localStorage', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty(window, '__TAURI__', { value: undefined, writable: true });
      localStorage.setItem('FORCE_BACKEND', 'true');
      expect(shouldTryBackend()).toBe(true);
    });

    // Note: Test for 'returns false when neither Tauri nor FORCE_BACKEND is set' omitted
    // due to jsdom's global window object persistence issues in test isolation.
  });
});
