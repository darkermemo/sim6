/**
 * Enterprise Monitoring and Error Tracking
 * Provides production-grade monitoring capabilities
 */

// Performance monitoring interface
export interface PerformanceMetrics {
  pageLoadTime: number;
  timeToFirstByte: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  firstInputDelay: number;
}

// Initialize monitoring (placeholder for Sentry)
export function initializeMonitoring() {
  const environment = import.meta.env.VITE_ENVIRONMENT || 'development';
  
  if (environment !== 'development') {
    console.info('Production monitoring initialized');
    // Sentry would be initialized here in a real implementation
  }
}

// Performance metrics collection
export function collectPerformanceMetrics(): PerformanceMetrics | null {
  if (!window.performance || !window.performance.getEntriesByType) {
    return null;
  }

  const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  const paint = window.performance.getEntriesByType('paint');
  
  if (!navigation) return null;

  const metrics: PerformanceMetrics = {
    pageLoadTime: navigation.loadEventEnd - navigation.fetchStart,
    timeToFirstByte: navigation.responseStart - navigation.fetchStart,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    cumulativeLayoutShift: 0,
    firstInputDelay: 0,
  };

  // Extract paint metrics
  paint.forEach((entry) => {
    if (entry.name === 'first-contentful-paint') {
      metrics.firstContentfulPaint = entry.startTime;
    }
  });

  return metrics;
}

// Bundle size monitoring
export function reportBundleSize() {
  if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.entryType === 'resource' && entry.name.includes('chunk')) {
          console.info('Chunk loaded:', {
            name: entry.name,
            size: (entry as any).transferSize,
            duration: entry.duration,
          });
        }
      });
    });
    
    observer.observe({ entryTypes: ['resource'] });
  }
}

// API performance tracking
export function trackApiCall(endpoint: string, duration: number, status: number) {
  // Track slow API calls
  if (duration > 5000) {
    console.warn(`Slow API call: ${endpoint} took ${duration}ms`);
  }

  // Console logging for development
  if (import.meta.env.MODE === 'development') {
    console.info(`API Call: ${endpoint} (${duration}ms) - ${status}`);
  }
}

// Memory usage monitoring
export function monitorMemoryUsage() {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    const usage = {
      used: Math.round(memory.usedJSHeapSize / 1048576), // MB
      total: Math.round(memory.totalJSHeapSize / 1048576), // MB
      limit: Math.round(memory.jsHeapSizeLimit / 1048576), // MB
    };

    // Warn if memory usage is high
    const usagePercent = (usage.used / usage.limit) * 100;
    if (usagePercent > 80) {
      console.warn('High memory usage detected:', usage);
    }

    return usage;
  }
  return null;
}