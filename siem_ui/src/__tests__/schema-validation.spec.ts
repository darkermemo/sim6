import { describe, it, expect } from 'vitest';
import {
  AlertsResponseSchema,
  RulesResponseSchema,
  CasesResponseSchema,
  AssetsResponseSchema
} from '../schemas/api-validation';

describe('API Schema Validation', () => {
  describe('AlertsResponseSchema', () => {
    it('should validate correct alert data', () => {
      const validResponse = {
        alerts: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Test Alert',
          severity: 'high',
          status: 'open',
          timestamp: '2024-01-01T00:00:00Z'
        }],
        total: 1
      };
      
      expect(() => AlertsResponseSchema.parse(validResponse)).not.toThrow();
    });

    it('should reject invalid alert data', () => {
      const invalidResponse = {
        alerts: [{
          id: 123, // should be string UUID
          name: null, // should be string
          severity: 'invalid', // should be valid severity
          status: 'invalid' // should be valid status
        }],
        total: 'invalid' // should be number
      };
      
      expect(() => AlertsResponseSchema.parse(invalidResponse)).toThrow();
    });
  });

  describe('RulesResponseSchema', () => {
    it('should validate correct rule data', () => {
      const validResponse = {
        rules: [{
          rule_id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Test Rule',
          description: 'Test description',
          type: 'detection',
          status: 'enabled',
          severity: 'medium',
          query: 'SELECT * FROM events',
          created_at: '2024-01-01T00:00:00Z',
          created_by: 'admin',
          enabled: true
        }],
        total: 1
      };
      
      expect(() => RulesResponseSchema.parse(validResponse)).not.toThrow();
    });

    it('should reject invalid rule data', () => {
      const invalidResponse = {
        rules: [{
          rule_id: null,
          name: '',
          enabled: 'yes', // should be boolean
          type: 'invalid' // should be valid type
        }],
        total: 'invalid' // should be number
      };
      
      expect(() => RulesResponseSchema.parse(invalidResponse)).toThrow();
    });
  });

  describe('CasesResponseSchema', () => {
    it('should validate correct case data', () => {
      const validResponse = {
        cases: [{
          case_id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Test Case',
          description: 'Test description',
          status: 'open',
          priority: 'high',
          assignee: 'user@example.com',
          created_by: 'admin',
          created_at: '2024-01-01T00:00:00Z'
        }],
        total: 1
      };
      
      expect(() => CasesResponseSchema.parse(validResponse)).not.toThrow();
    });

    it('should reject invalid case data', () => {
      const invalidResponse = {
        cases: [{
          case_id: undefined,
          title: 123, // should be string
          priority: 'invalid' // should be valid priority
        }],
        total: 'invalid' // should be number
      };
      
      expect(() => CasesResponseSchema.parse(invalidResponse)).toThrow();
    });
  });

  describe('AssetsResponseSchema', () => {
    it('should validate correct asset data', () => {
      const validResponse = {
        assets: [{
          asset_id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Test Asset',
          type: 'server',
          status: 'active',
          ip_address: '192.168.1.1',
          last_seen: '2024-01-01T00:00:00Z',
          created_at: '2024-01-01T00:00:00Z'
        }],
        total: 1
      };
      
      expect(() => AssetsResponseSchema.parse(validResponse)).not.toThrow();
    });

    it('should reject invalid asset data', () => {
      const invalidResponse = {
        assets: [{
          asset_id: [],
          name: null,
          type: 123 // should be string
        }],
        total: 'invalid' // should be number
      };
      
      expect(() => AssetsResponseSchema.parse(invalidResponse)).toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty arrays', () => {
      expect(() => AlertsResponseSchema.parse({ alerts: [], total: 0 })).not.toThrow();
      expect(() => RulesResponseSchema.parse({ rules: [], total: 0 })).not.toThrow();
      expect(() => CasesResponseSchema.parse({ cases: [], total: 0 })).not.toThrow();
      expect(() => AssetsResponseSchema.parse({ assets: [], total: 0 })).not.toThrow();
    });

    it('should reject invalid response structures', () => {
      expect(() => AlertsResponseSchema.parse(null)).toThrow();
      expect(() => RulesResponseSchema.parse(undefined)).toThrow();
      expect(() => CasesResponseSchema.parse('string')).toThrow();
      expect(() => AssetsResponseSchema.parse([])).toThrow();
    });
  });
});