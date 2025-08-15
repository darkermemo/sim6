/**
 * Development-only Accessibility Validator
 * Shows real-time WCAG contrast validation during development
 */

import { useState, useEffect } from 'react';
import { 
  generateAccessibilityReport, 
  getAccessibilityViolations 
} from '@/lib/accessibility-validator';

export function AccessibilityValidator() {
  const [isOpen, setIsOpen] = useState(false);
  const [report, setReport] = useState('');
  const [violations, setViolations] = useState<Array<any>>([]);

  const runValidation = () => {
    const newReport = generateAccessibilityReport();
    const newViolations = getAccessibilityViolations();
    setReport(newReport);
    setViolations(newViolations);
  };

  useEffect(() => {
    runValidation();
  }, []);

  // Only show in development
  if ((import.meta as any).env.PROD) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      fontFamily: 'monospace'
    }}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          backgroundColor: violations.length > 0 ? 'var(--destructive)' : 'var(--success)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '12px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
      >
        A11Y {violations.length > 0 ? `${violations.length} Issues` : 'OK'}
      </button>

      {/* Validator Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          right: '0',
          marginBottom: '8px',
          width: '400px',
          maxHeight: '500px',
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '16px',
          fontSize: '11px',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          color: 'var(--fg)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: '1px solid var(--border)'
          }}>
            <h3 style={{ margin: 0, fontSize: '13px' }}>WCAG AA Validation</h3>
            <button
              onClick={runValidation}
              style={{
                backgroundColor: 'var(--accent-9)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              Refresh
            </button>
          </div>

          {/* Violations Summary */}
          {violations.length > 0 && (
            <div style={{
              backgroundColor: 'var(--destructive-bg)',
              border: '1px solid var(--destructive-border)',
              borderRadius: '4px',
              padding: '8px',
              marginBottom: '12px'
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: 'var(--destructive)', fontSize: '12px' }}>
                ❌ {violations.length} Accessibility Violations
              </h4>
              {violations.map((violation, i) => (
                <div key={i} style={{ marginBottom: '4px', fontSize: '10px' }}>
                  <strong style={{ color: 'var(--destructive)' }}>{violation.category}</strong><br/>
                  {violation.combination}: {violation.ratio}:1 
                  (needs {violation.required}:1)
                </div>
              ))}
            </div>
          )}

          {/* Full Report */}
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '12px' }}>Full Report:</h4>
            <pre style={{
              fontSize: '9px',
              lineHeight: '1.3',
              margin: 0,
              whiteSpace: 'pre-wrap',
              backgroundColor: 'var(--muted)',
              padding: '8px',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '200px'
            }}>
              {report}
            </pre>
          </div>

          {/* Quick Actions */}
          <div style={{
            marginTop: '12px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border)',
            fontSize: '10px'
          }}>
            <button
              onClick={() => {
                console.log('=== ACCESSIBILITY REPORT ===');
                console.log(report);
                console.log('Violations:', violations);
              }}
              style={{
                backgroundColor: 'var(--muted)',
                color: 'var(--fg)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '10px',
                cursor: 'pointer',
                marginRight: '8px'
              }}
            >
              Log to Console
            </button>
            
            <button
              onClick={() => {
                const blob = new Blob([report], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'accessibility-report.txt';
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{
                backgroundColor: 'var(--muted)',
                color: 'var(--fg)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              Download Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
