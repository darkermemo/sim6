/**
 * Accessibility Validation Utilities
 * WCAG AA Compliance Testing (4.5:1 body text, 3:1 UI text)
 */

/**
 * Convert HSL color to RGB values
 */
function hslToRgbValues(hslString: string): [number, number, number] {
  const match = hslString.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/);
  if (!match) {
    // Try to parse as RGB or hex
    const rgbMatch = hslString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
    }
    
    const hexMatch = hslString.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (hexMatch) {
      return [
        parseInt(hexMatch[1], 16),
        parseInt(hexMatch[2], 16), 
        parseInt(hexMatch[3], 16)
      ];
    }
    
    return [0, 0, 0]; // Fallback
  }
  
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
  
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Calculate relative luminance according to WCAG formula
 */
function getRelativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hslToRgbValues(color1);
  const rgb2 = hslToRgbValues(color2);
  
  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG AA standards
 */
export function isAccessible(ratio: number, level: 'AA' | 'AAA' = 'AA', size: 'normal' | 'large' = 'normal'): boolean {
  if (level === 'AAA') {
    return size === 'large' ? ratio >= 4.5 : ratio >= 7;
  }
  return size === 'large' ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Validate all theme colors for accessibility
 */
export function validateThemeAccessibility(): {
  light: { [key: string]: { ratio: number; accessible: boolean; category: string } };
  dark: { [key: string]: { ratio: number; accessible: boolean; category: string } };
} {
  // Get CSS variables for both themes
  const getCSSVar = (name: string, isDark = false) => {
    if (typeof window === 'undefined') return '';
    
    // Temporarily switch theme to get the right values
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');
    
    if (isDark !== wasDark) {
      html.classList.toggle('dark', isDark);
    }
    
    const value = getComputedStyle(html).getPropertyValue(name).trim();
    
    // Restore original state
    if (isDark !== wasDark) {
      html.classList.toggle('dark', wasDark);
    }
    
    return value;
  };
  
  const testCombinations = [
    // Body text (must be 4.5:1)
    { fg: '--fg', bg: '--bg', category: 'Body Text (Critical)', size: 'normal' as const },
    { fg: '--fg', bg: '--card', category: 'Card Text (Critical)', size: 'normal' as const },
    
    // UI text (can be 3:1 for large text)
    { fg: '--fg-muted', bg: '--bg', category: 'Muted Text', size: 'normal' as const },
    { fg: '--fg-subtle', bg: '--bg', category: 'Subtle Text (3:1 OK)', size: 'large' as const },
    
    // Interactive elements
    { fg: '--fg-accent', bg: '--bg', category: 'Accent Text', size: 'normal' as const },
    { fg: '--fg-on-accent', bg: '--accent-9', category: 'Button Text', size: 'normal' as const },
    
    // Borders (should have at least 3:1 with background)
    { fg: '--border', bg: '--bg', category: 'Border Contrast', size: 'large' as const },
    { fg: '--border-strong', bg: '--bg', category: 'Strong Border', size: 'large' as const },
  ];
  
  const results = {
    light: {} as { [key: string]: { ratio: number; accessible: boolean; category: string } },
    dark: {} as { [key: string]: { ratio: number; accessible: boolean; category: string } }
  };
  
  testCombinations.forEach(({ fg, bg, category, size }) => {
    // Test light theme
    const lightFg = getCSSVar(fg, false);
    const lightBg = getCSSVar(bg, false);
    const lightRatio = getContrastRatio(lightFg, lightBg);
    results.light[`${fg}-on-${bg}`] = {
      ratio: Math.round(lightRatio * 100) / 100,
      accessible: isAccessible(lightRatio, 'AA', size),
      category
    };
    
    // Test dark theme
    const darkFg = getCSSVar(fg, true);
    const darkBg = getCSSVar(bg, true);
    const darkRatio = getContrastRatio(darkFg, darkBg);
    results.dark[`${fg}-on-${bg}`] = {
      ratio: Math.round(darkRatio * 100) / 100,
      accessible: isAccessible(darkRatio, 'AA', size),
      category
    };
  });
  
  return results;
}

/**
 * Generate accessibility report
 */
export function generateAccessibilityReport(): string {
  const results = validateThemeAccessibility();
  
  let report = '=== ACCESSIBILITY VALIDATION REPORT ===\n\n';
  
  ['light', 'dark'].forEach(theme => {
    report += `${theme.toUpperCase()} THEME:\n`;
    report += '─'.repeat(30) + '\n';
    
    const themeResults = results[theme as keyof typeof results];
    let passed = 0;
    let total = 0;
    
    Object.entries(themeResults).forEach(([combo, result]) => {
      total++;
      if (result.accessible) passed++;
      
      const status = result.accessible ? '✅ PASS' : '❌ FAIL';
      report += `${status} ${result.category}: ${result.ratio}:1\n`;
      report += `     ${combo}\n\n`;
    });
    
    report += `SUMMARY: ${passed}/${total} combinations accessible\n`;
    report += `COMPLIANCE: ${passed === total ? '✅ WCAG AA' : '❌ NEEDS WORK'}\n\n`;
  });
  
  return report;
}

/**
 * Log accessibility report to console
 */
export function logAccessibilityReport(): void {
  console.log(generateAccessibilityReport());
}

/**
 * Check if current theme has good contrast
 */
export function validateCurrentTheme(): boolean {
  const results = validateThemeAccessibility();
  const isDark = document.documentElement.classList.contains('dark');
  const currentResults = results[isDark ? 'dark' : 'light'];
  
  return Object.values(currentResults).every(result => result.accessible);
}

/**
 * Get list of accessibility violations in current theme
 */
export function getAccessibilityViolations(): Array<{
  combination: string;
  category: string;
  ratio: number;
  required: number;
}> {
  const results = validateThemeAccessibility();
  const isDark = document.documentElement.classList.contains('dark');
  const currentResults = results[isDark ? 'dark' : 'light'];
  
  return Object.entries(currentResults)
    .filter(([, result]) => !result.accessible)
    .map(([combo, result]) => ({
      combination: combo,
      category: result.category,
      ratio: result.ratio,
      required: result.category.includes('3:1 OK') ? 3 : 4.5
    }));
}
