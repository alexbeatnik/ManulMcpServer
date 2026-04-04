import { describe, it, expect } from 'vitest';
import {
  normalizeBaseUrl,
  normalizeTimeout,
  normalizeBoolean,
  DEFAULT_API_BASE_URL,
  DEFAULT_TIMEOUT_MS,
} from '../src/config/defaults';

describe('normalizeBaseUrl', () => {
  it('returns default for empty string', () => {
    expect(normalizeBaseUrl('')).toBe(DEFAULT_API_BASE_URL);
  });

  it('strips trailing slashes', () => {
    expect(normalizeBaseUrl('http://localhost:3000///')).toBe('http://localhost:3000');
  });

  it('trims whitespace', () => {
    expect(normalizeBaseUrl('  http://example.com  ')).toBe('http://example.com');
  });

  it('returns default for whitespace-only string', () => {
    expect(normalizeBaseUrl('   ')).toBe(DEFAULT_API_BASE_URL);
  });
});

describe('normalizeTimeout', () => {
  it('returns default for undefined', () => {
    expect(normalizeTimeout(undefined)).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('returns default for NaN string', () => {
    expect(normalizeTimeout('abc')).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('clamps to minimum 1000', () => {
    expect(normalizeTimeout(500)).toBe(1000);
  });

  it('truncates fractional values', () => {
    expect(normalizeTimeout(5500.9)).toBe(5500);
  });

  it('parses string values', () => {
    expect(normalizeTimeout('30000')).toBe(30000);
  });
});

describe('normalizeBoolean', () => {
  it('returns fallback for undefined', () => {
    expect(normalizeBoolean(undefined, true)).toBe(true);
    expect(normalizeBoolean(undefined, false)).toBe(false);
  });

  it('parses truthy strings', () => {
    expect(normalizeBoolean('true', false)).toBe(true);
    expect(normalizeBoolean('1', false)).toBe(true);
    expect(normalizeBoolean('yes', false)).toBe(true);
    expect(normalizeBoolean('on', false)).toBe(true);
  });

  it('parses falsy strings', () => {
    expect(normalizeBoolean('false', true)).toBe(false);
    expect(normalizeBoolean('0', true)).toBe(false);
    expect(normalizeBoolean('no', true)).toBe(false);
    expect(normalizeBoolean('off', true)).toBe(false);
  });

  it('returns fallback for unrecognized strings', () => {
    expect(normalizeBoolean('maybe', true)).toBe(true);
    expect(normalizeBoolean('maybe', false)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(normalizeBoolean('TRUE', false)).toBe(true);
    expect(normalizeBoolean('FALSE', true)).toBe(false);
  });
});
