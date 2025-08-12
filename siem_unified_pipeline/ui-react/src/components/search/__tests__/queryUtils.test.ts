import { describe, it, expect } from 'vitest';

// Simple query parsing utilities
export function parseQueryTokens(query: string): string[] {
  const tokens: string[] = [];
  const regex = /(?:[^\s"]+|"[^"]*")+/g;
  let match;
  
  while ((match = regex.exec(query)) !== null) {
    tokens.push(match[0]);
  }
  
  return tokens;
}

export function isFieldValuePair(token: string): boolean {
  // Support both field:value and field!=value
  return (token.includes(':') || token.includes('!=')) && 
         !token.startsWith('"') &&
         !token.startsWith(':') && !token.endsWith(':') &&
         !token.startsWith('!=') && !token.endsWith('!=');
}

describe('Query Tokenization', () => {
  describe('parseQueryTokens', () => {
    it('handles simple space-separated tokens', () => {
      const tokens = parseQueryTokens('failed login attempt');
      expect(tokens).toEqual(['failed', 'login', 'attempt']);
    });

    it('preserves quoted phrases as single token', () => {
      const tokens = parseQueryTokens('message:"failed login" user:alice');
      expect(tokens).toEqual(['message:"failed login"', 'user:alice']);
    });

    it('handles field:value pairs', () => {
      const tokens = parseQueryTokens('severity:high AND source:firewall');
      expect(tokens).toEqual(['severity:high', 'AND', 'source:firewall']);
    });

    it('handles empty query', () => {
      const tokens = parseQueryTokens('');
      expect(tokens).toEqual([]);
    });

    it('handles query with extra spaces', () => {
      const tokens = parseQueryTokens('  failed   login  ');
      expect(tokens).toEqual(['failed', 'login']);
    });
  });

  describe('isFieldValuePair', () => {
    it('identifies field:value pairs', () => {
      expect(isFieldValuePair('user:alice')).toBe(true);
      expect(isFieldValuePair('severity:high')).toBe(true);
    });

    it('rejects quoted strings', () => {
      expect(isFieldValuePair('"user:alice"')).toBe(false);
    });

    it('rejects plain tokens', () => {
      expect(isFieldValuePair('failed')).toBe(false);
      expect(isFieldValuePair('AND')).toBe(false);
    });
  });
});
