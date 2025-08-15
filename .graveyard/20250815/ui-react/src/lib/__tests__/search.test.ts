import { describe, it, expect } from 'vitest';
import { parseTimeRange } from '../search';

describe('parseTimeRange', () => {
  it('converts 15m to seconds', () => {
    const result = parseTimeRange('15m');
    expect(result).toEqual({ last_seconds: 15 * 60 });
  });

  it('converts 1h to seconds', () => {
    const result = parseTimeRange('1h');
    expect(result).toEqual({ last_seconds: 60 * 60 });
  });

  it('converts 24h to seconds', () => {
    const result = parseTimeRange('24h');
    expect(result).toEqual({ last_seconds: 24 * 60 * 60 });
  });

  it('converts 7d to seconds', () => {
    const result = parseTimeRange('7d');
    expect(result).toEqual({ last_seconds: 7 * 24 * 60 * 60 });
  });

  it('defaults to 1h for custom range', () => {
    const result = parseTimeRange('custom');
    expect(result).toEqual({ last_seconds: 60 * 60 });
  });

  it('defaults to 1h for unknown range', () => {
    const result = parseTimeRange('unknown');
    expect(result).toEqual({ last_seconds: 60 * 60 });
  });
});
