import { describe, it, expect } from 'vitest';
import { getSeverityColor, getStatusColor, formatRelativeTime } from '../alerts';

describe('alerts utilities', () => {
  describe('getSeverityColor', () => {
    it('returns correct colors for severity levels', () => {
      expect(getSeverityColor('CRITICAL')).toBe('red');
      expect(getSeverityColor('HIGH')).toBe('orange');
      expect(getSeverityColor('MEDIUM')).toBe('yellow');
      expect(getSeverityColor('LOW')).toBe('blue');
      expect(getSeverityColor('INFO')).toBe('gray');
    });
  });

  describe('getStatusColor', () => {
    it('returns correct colors for status values', () => {
      expect(getStatusColor('OPEN')).toBe('red');
      expect(getStatusColor('ACK')).toBe('yellow');
      expect(getStatusColor('CLOSED')).toBe('green');
      expect(getStatusColor('SUPPRESSED')).toBe('gray');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats recent times correctly', () => {
      const now = new Date();
      
      // Just now
      expect(formatRelativeTime(now.toISOString())).toBe('just now');
      
      // 30 seconds ago
      const thirtySecsAgo = new Date(now.getTime() - 30 * 1000);
      expect(formatRelativeTime(thirtySecsAgo.toISOString())).toBe('30s ago');
      
      // 5 minutes ago
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinsAgo.toISOString())).toBe('5m ago');
      
      // 2 hours ago
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe('2h ago');
      
      // 3 days ago
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeDaysAgo.toISOString())).toBe('3d ago');
    });
  });
});
