import { describe, it, expect } from 'vitest';
import {
  assertLoopbackBindHost,
  assertLoopbackBaseUrl,
  isAllowedCompanionOrigin,
  isLoopbackHost,
  hostnameFromHostHeader,
} from './origin';

describe('origin / loopback guards', () => {
  it('accepts loopback hosts only', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('192.168.1.10')).toBe(false);
  });

  it('allows only loopback http(s) origins', () => {
    expect(isAllowedCompanionOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedCompanionOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(isAllowedCompanionOrigin('https://evil.example')).toBe(false);
    expect(isAllowedCompanionOrigin(null)).toBe(false);
  });

  it('refuses non-loopback bind', () => {
    expect(() => assertLoopbackBindHost('0.0.0.0')).toThrow(/loopback/i);
    expect(() => assertLoopbackBindHost('127.0.0.1')).not.toThrow();
  });

  it('parses Host headers', () => {
    expect(hostnameFromHostHeader('127.0.0.1:8787')).toBe('127.0.0.1');
    expect(hostnameFromHostHeader('localhost')).toBe('localhost');
  });

  it('assertLoopbackBaseUrl', () => {
    expect(assertLoopbackBaseUrl('http://127.0.0.1:8787').hostname).toBe('127.0.0.1');
    expect(() => assertLoopbackBaseUrl('http://10.0.0.2:8787')).toThrow(/loopback/i);
  });
});
