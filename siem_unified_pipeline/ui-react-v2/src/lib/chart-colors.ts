/**
 * Chart Color Utilities
 * Dynamically reads colors from CSS custom properties for theme-aware charts
 */

/**
 * Gets a CSS custom property value from the document root
 */
function getCSSVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Gets the current chart color palette
 */
export function getChartColors() {
  return {
    primary: getCSSVar('--chart-1'),
    secondary: getCSSVar('--chart-2'),
    tertiary: getCSSVar('--chart-3'),
    quaternary: getCSSVar('--chart-4'),
    quinary: getCSSVar('--chart-5'),
    senary: getCSSVar('--chart-6'),
    septenary: getCSSVar('--chart-7'),
    octonary: getCSSVar('--chart-8'),
  };
}

/**
 * Gets theme-aware colors for chart elements
 */
export function getChartThemeColors() {
  return {
    // Text colors
    text: getCSSVar('--fg'),
    textMuted: getCSSVar('--fg-muted'),
    textSubtle: getCSSVar('--fg-subtle'),
    
    // Background colors
    background: getCSSVar('--bg'),
    surface: getCSSVar('--card'),
    muted: getCSSVar('--muted'),
    
    // Border colors
    border: getCSSVar('--border'),
    borderMuted: getCSSVar('--border-muted'),
    
    // Accent colors
    accent: getCSSVar('--accent-9'),
    accentLight: getCSSVar('--accent-3'),
    accentDark: getCSSVar('--accent-11'),
    
    // Semantic colors
    success: getCSSVar('--success'),
    warning: getCSSVar('--warning'),
    destructive: getCSSVar('--destructive'),
  };
}

/**
 * Gets an array of chart colors for multi-series charts
 */
export function getChartColorArray(): string[] {
  const colors = getChartColors();
  return [
    colors.primary,
    colors.secondary,
    colors.tertiary,
    colors.quaternary,
    colors.quinary,
    colors.senary,
    colors.septenary,
    colors.octonary,
  ].filter(Boolean); // Remove any empty colors
}

/**
 * Gets loading state colors for charts
 */
export function getChartLoadingColors() {
  const theme = getChartThemeColors();
  return {
    color: theme.accent,
    textColor: theme.text,
    maskColor: `${theme.background}cc`, // Add transparency
  };
}

/**
 * Gets error state colors for charts
 */
export function getChartErrorColors() {
  const theme = getChartThemeColors();
  return {
    background: theme.surface,
    border: theme.border,
    text: theme.text,
    icon: theme.destructive,
  };
}

/**
 * HSL to RGB conversion for ECharts compatibility
 */
export function hslToRgb(hslString: string): string {
  // Extract HSL values from string like "hsl(206 100% 50%)"
  const match = hslString.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/);
  if (!match) return hslString; // Return original if not HSL format
  
  const h = parseInt(match[1]) / 360;
  const s = parseInt(match[2]) / 100;
  const l = parseInt(match[3]) / 100;
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Gets chart colors converted to RGB format for better compatibility
 */
export function getChartColorsRgb(): string[] {
  return getChartColorArray().map(color => {
    // If it's already a hex or rgb color, return as-is
    if (color.startsWith('#') || color.startsWith('rgb')) {
      return color;
    }
    // Convert HSL to RGB
    return hslToRgb(color);
  });
}
