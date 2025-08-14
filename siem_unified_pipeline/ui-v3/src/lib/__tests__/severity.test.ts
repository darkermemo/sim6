import { normalizeSeverity } from '../severity';

describe('normalizeSeverity', () => {
  it.each([
    [undefined, 'unknown'],
    [null, 'unknown'],
    [3, 'unknown'],
    ['', 'unknown'],
    ['WARN', 'medium'],
    ['Informational', 'info'],
    ['CRIT', 'critical'],
    ['fatal', 'critical'],
    ['error', 'high'],
    ['notice', 'low'],
    ['debug', 'info'],
    ['p1', 'critical'],
    ['p2', 'high'],
    ['p3', 'medium'],
    ['p4', 'low'],
    ['garbage', 'unknown']
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeSeverity(input)).toBe(expected);
  });

  it('handles case variations', () => {
    expect(normalizeSeverity('CRITICAL')).toBe('critical');
    expect(normalizeSeverity('High')).toBe('high');
    expect(normalizeSeverity('  medium  ')).toBe('medium');
  });

  it('returns valid severity types only', () => {
    const testValues = [undefined, null, 3, 'WARN', 'Informational', 'CRIT', 'garbage'];
    testValues.forEach(v => {
      const result = normalizeSeverity(v);
      expect(['critical', 'high', 'medium', 'low', 'info', 'unknown']).toContain(result);
    });
  });
});
