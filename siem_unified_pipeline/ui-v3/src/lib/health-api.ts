import { http } from '@/lib/http';
import type { 
  HealthSummary, 
  DiagnoseRequest, 
  DiagnoseResponse, 
  AutoFixRequest, 
  AutoFixResponse 
} from '@/types/health';

export class HealthAPI {
  /**
   * Get comprehensive health summary snapshot
   */
  static async getSummary(): Promise<HealthSummary> {
    return http<HealthSummary>('/health/summary');
  }

  /**
   * Run deep diagnostic check for a specific component
   */
  static async diagnose(request: DiagnoseRequest): Promise<DiagnoseResponse> {
    return http<DiagnoseResponse>('/health/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  }

  /**
   * Execute automated fix for known issues
   */
  static async autoFix(request: AutoFixRequest): Promise<AutoFixResponse> {
    return http<AutoFixResponse>('/health/autofix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  }

  /**
   * Create SSE connection for real-time health updates
   */
  static createStreamConnection(onMessage: (data: any) => void, onError?: (error: Event) => void): EventSource {
    const BASE = process.env.NEXT_PUBLIC_BASEPATH || '';
    const url = `${BASE}/api/v2/health/stream`;
    
    const eventSource = new EventSource(url);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      if (onError) {
        onError(error);
      }
    };
    
    return eventSource;
  }
}
