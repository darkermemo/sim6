/**
 * Chart - Enterprise-grade chart wrapper using ECharts
 * 
 * Features:
 * - Single prop: option (ECharts configuration)
 * - Automatic resize handling
 * - Theme support (light/dark)
 * - Loading and error states
 * - Performance optimized
 * - TypeScript-first with proper error boundaries
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as echarts from 'echarts/core';
import { getChartThemeColors, getChartLoadingColors, getChartErrorColors, getChartColorsRgb } from '@/lib/chart-colors';
import {
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components';
import {
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
} from 'echarts/charts';
import {
  CanvasRenderer,
} from 'echarts/renderers';

// Register components
echarts.use([
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  CanvasRenderer,
]);

// === TYPES ===

export interface ChartProps {
  option: echarts.EChartsCoreOption;
  width?: string | number;
  height?: string | number;
  loading?: boolean;
  loadingText?: string;
  error?: Error | null;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  onChartReady?: (chart: echarts.ECharts) => void;
  onEvents?: Record<string, (params: any) => void>;
  style?: React.CSSProperties;
}

// === THEMES ===

const LIGHT_THEME = {
  backgroundColor: '#ffffff',
  textStyle: {
    color: '#333333',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  color: [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#06b6d4', '#84cc16', '#f97316',
    '#ec4899', '#6366f1', '#14b8a6', '#eab308'
  ],
};

const DARK_THEME = {
  backgroundColor: '#1f2937',
  textStyle: {
    color: '#f3f4f6',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  color: [
    '#60a5fa', '#34d399', '#fbbf24', '#f87171',
    '#a78bfa', '#22d3ee', '#a3e635', '#fb923c',
    '#f472b6', '#818cf8', '#2dd4bf', '#facc15'
  ],
};

// === HOOKS ===

function useTheme(theme: 'light' | 'dark' | 'auto') {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (theme === 'auto') {
      // Check system preference or document class
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches ||
                         document.documentElement.classList.contains('dark');
      setResolvedTheme(prefersDark ? 'dark' : 'light');

      // Listen for changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const observer = new MutationObserver(() => {
        const isDark = document.documentElement.classList.contains('dark');
        setResolvedTheme(isDark ? 'dark' : 'light');
      });

      const handleChange = () => setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      mediaQuery.addEventListener('change', handleChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      return () => {
        mediaQuery.removeEventListener('change', handleChange);
        observer.disconnect();
      };
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  return resolvedTheme;
}

// === MAIN COMPONENT ===

export function Chart({
  option,
  width = '100%',
  height = 300,
  loading = false,
  loadingText = 'Loading chart...',
  error = null,
  theme = 'auto',
  className = '',
  onChartReady,
  onEvents = {},
  style = {},
}: ChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const resolvedTheme = useTheme(theme);
  const themeConfig = resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME;

  // Initialize chart
  const initChart = useCallback(() => {
    if (!chartRef.current || chartInstance.current) return;

    try {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: 'canvas',
        useDirtyRect: true, // Performance optimization
      });

      // Register event handlers
      Object.entries(onEvents).forEach(([event, handler]) => {
        chartInstance.current?.on(event, handler);
      });

      // Callback when chart is ready
      if (onChartReady && chartInstance.current) {
        onChartReady(chartInstance.current);
      }

      setIsInitialized(true);
    } catch (err) {
      console.error('Failed to initialize chart:', err);
    }
  }, [onChartReady, onEvents]);

  // Update chart option
  const updateChart = useCallback(() => {
    if (!chartInstance.current || !option) return;

    try {
      // Merge with theme
      const mergedOption = {
        ...themeConfig,
        ...option,
        textStyle: {
          ...themeConfig.textStyle,
          ...option.textStyle,
        },
      };

      chartInstance.current.setOption(mergedOption, true);
    } catch (err) {
      console.error('Failed to update chart:', err);
    }
  }, [option, themeConfig]);

  // Handle resize
  const handleResize = useCallback(() => {
    if (chartInstance.current) {
      chartInstance.current.resize();
    }
  }, []);

  // Initialize chart on mount
  useEffect(() => {
    initChart();
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
        setIsInitialized(false);
      }
    };
  }, [initChart]);

  // Update chart when option changes
  useEffect(() => {
    if (isInitialized) {
      updateChart();
    }
  }, [isInitialized, updateChart]);

  // Handle loading state
  useEffect(() => {
    if (chartInstance.current) {
      if (loading) {
        const loadingColors = getChartLoadingColors();
        chartInstance.current.showLoading('default', {
          text: loadingText,
          color: loadingColors.color,
          textColor: loadingColors.textColor,
          maskColor: loadingColors.maskColor,
          zlevel: 0,
        });
      } else {
        chartInstance.current.hideLoading();
      }
    }
  }, [loading, loadingText, resolvedTheme]);

  // Handle window resize
  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Show error state
  if (error) {
    const errorColors = getChartErrorColors();
    return (
      <div 
        className={`chart-error ${className}`}
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: errorColors.background,
          border: `1px solid ${errorColors.border}`,
          borderRadius: '6px',
          ...style,
        }}
      >
        <div style={{ 
          textAlign: 'center',
          color: errorColors.icon,
          padding: '20px'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>⚠️</div>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>Chart Error</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>{error.message}</div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (!option) {
    return (
      <div 
        className={`chart-empty ${className}`}
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
          border: `1px solid ${resolvedTheme === 'dark' ? '#374151' : '#e5e7eb'}`,
          borderRadius: '6px',
          ...style,
        }}
      >
        <div style={{ 
          textAlign: 'center',
          color: resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280',
          padding: '20px'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>📊</div>
          <div style={{ fontSize: '14px' }}>No chart data</div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={chartRef}
      className={`chart ${className}`}
      style={{
        width,
        height,
        ...style,
      }}
    />
  );
}

// === CHART UTILITIES ===

export const ChartUtils = {
  /**
   * Create timeline chart option from buckets data
   */
  createTimelineOption: (buckets: Array<{ timestamp: number; count: number }>, title?: string) => {
    const data = buckets.map(bucket => [
      new Date(bucket.timestamp * 1000),
      bucket.count
    ]);

    return {
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const [timestamp, count] = params[0].data;
          return `${timestamp.toLocaleString()}<br/>Events: ${count.toLocaleString()}`;
        },
      },
      xAxis: {
        type: 'time',
        splitLine: { show: false },
        axisLine: { lineStyle: { width: 1 } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } },
        axisLine: { show: false },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      series: [{
        type: 'line',
        data,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.1 },
      }],
    } as echarts.EChartsCoreOption;
  },

  /**
   * Create pie chart option from facet data
   */
  createPieOption: (data: Array<{ name: string; value: number }>, title?: string) => {
    return {
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        textStyle: { fontSize: 12 },
      },
      series: [{
        type: 'pie',
        radius: ['30%', '70%'],
        center: ['60%', '50%'],
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }],
    } as echarts.EChartsCoreOption;
  },

  /**
   * Create bar chart option from facet data
   */
  createBarOption: (data: Array<{ name: string; value: number }>, title?: string) => {
    return {
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      xAxis: {
        type: 'category',
        data: data.map(item => item.name),
        axisLine: { lineStyle: { width: 1 } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } },
        axisLine: { show: false },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      series: [{
        type: 'bar',
        data: data.map(item => item.value),
        itemStyle: { borderRadius: [2, 2, 0, 0] },
      }],
    } as echarts.EChartsCoreOption;
  },
};

export default Chart;
