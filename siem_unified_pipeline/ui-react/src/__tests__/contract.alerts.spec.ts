import { describe, it, expect } from 'vitest';
import wireAlerts from '../../fixtures/wire_alerts.json';
import wireAlertGet from '../../fixtures/wire_alert_get.json';
import type { AlertsListRes, AlertGetRes, Alert, AlertNote } from '@/lib/alerts';

describe('Alerts API Contract', () => {
  describe('AlertsListRes', () => {
    it('matches wire format for list response', () => {
      const response: AlertsListRes = wireAlerts as AlertsListRes;
      
      // Check meta
      expect(response.meta).toBeDefined();
      expect(response.meta.took_ms).toBeTypeOf('number');
      expect(response.meta.row_count).toBeTypeOf('number');
      expect(response.meta.next_cursor).toBeTypeOf('string');
      
      // Check data array
      expect(response.data).toBeInstanceOf(Array);
      expect(response.data.length).toBe(3);
      
      // Check first alert structure
      const alert: Alert = response.data[0];
      expect(alert.tenant_id).toBe(101);
      expect(alert.alert_id).toMatch(/^[A-Z0-9]{26}$/); // ULID format
      expect(alert.rule_id).toBeTypeOf('string');
      expect(alert.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO date
      expect(alert.severity).toMatch(/^(CRITICAL|HIGH|MEDIUM|LOW|INFO)$/);
      expect(alert.status).toMatch(/^(OPEN|ACK|CLOSED|SUPPRESSED)$/);
      expect(alert.title).toBeTypeOf('string');
      
      // Optional fields
      if (alert.event_timestamp) {
        expect(alert.event_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
      if (alert.summary) {
        expect(alert.summary).toBeTypeOf('string');
      }
      if (alert.alert_key) {
        expect(alert.alert_key).toBeTypeOf('string');
      }
      if (alert.dedupe_hash !== undefined) {
        expect(['string', 'number']).toContain(typeof alert.dedupe_hash);
      }
    });

    it('handles all severity levels', () => {
      const severities = wireAlerts.data.map(a => a.severity);
      expect(severities).toContain('HIGH');
      expect(severities).toContain('CRITICAL');
      expect(severities).toContain('MEDIUM');
    });

    it('handles all status values', () => {
      const statuses = wireAlerts.data.map(a => a.status);
      expect(statuses).toContain('OPEN');
      expect(statuses).toContain('ACK');
      expect(statuses).toContain('CLOSED');
    });
  });

  describe('AlertGetRes', () => {
    it('matches wire format for get response', () => {
      const response: AlertGetRes = wireAlertGet as AlertGetRes;
      
      // Has all base alert fields
      expect(response.tenant_id).toBe(101);
      expect(response.alert_id).toBeTypeOf('string');
      expect(response.rule_id).toBeTypeOf('string');
      expect(response.created_at).toBeTypeOf('string');
      expect(response.severity).toBeTypeOf('string');
      expect(response.status).toBeTypeOf('string');
      expect(response.title).toBeTypeOf('string');
      
      // Has extended fields
      expect(response.event).toBeDefined();
      expect(response.event).toBeTypeOf('object');
      
      if (response.fields) {
        expect(response.fields).toBeTypeOf('object');
      }
      
      if (response.tags) {
        expect(response.tags).toBeInstanceOf(Array);
        response.tags.forEach(tag => {
          expect(tag).toBeTypeOf('string');
        });
      }
      
      // Has notes
      expect(response.notes).toBeDefined();
      expect(response.notes).toBeInstanceOf(Array);
      
      const note: AlertNote = response.notes![0];
      expect(note.note_id).toBeTypeOf('string');
      expect(note.author).toBeTypeOf('string');
      expect(note.created_at).toBeTypeOf('string');
      expect(note.body).toBeTypeOf('string');
    });

    it('event object has expected fields', () => {
      const event = wireAlertGet.event;
      expect(event).toBeDefined();
      expect(event?.event_timestamp).toBeTypeOf('string');
      expect(event?.source).toBeTypeOf('string');
      expect(event?.message).toBeTypeOf('string');
    });
  });
});
