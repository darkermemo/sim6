# 🎨 Live Theme Customizer

## Overview
The Theme Customizer provides a real-time visual interface for editing all design tokens across the entire SIEM application. Changes are applied instantly without page refreshes.

## 🚀 Features

### **Live Token Editing**
- **Instant Preview**: Changes apply immediately across all UI elements
- **Visual Feedback**: See every component update in real-time
- **No Rebuilds**: Pure CSS variable manipulation

### **Comprehensive Token Coverage**
- **Colors**: All semantic color tokens (primary, secondary, muted, etc.)
- **Sizing**: Control heights, padding, font sizes for all components
- **Shape**: Global border radius that affects every rounded element
- **SIEM Tokens**: Severity levels and status indicators

### **Preset System**
- **Export/Import**: Save custom themes as JSON files
- **Quick Presets**: One-click theme switching (Green, Purple, Sharp corners)
- **Reset**: Restore default values instantly

### **Live Preview Panel**
- **Component Showcase**: See buttons, inputs, cards, badges update live
- **SIEM Elements**: Preview severity badges and status indicators
- **Token Values**: Display current CSS variable values

## 🎯 Usage

### **Access the Customizer**
Navigate to `/ui/v3/theme` or click "Theme" in the main navigation.

### **Edit Tokens**
1. **Colors Tab**: Modify primary, secondary, background colors (HSL format)
2. **Sizing Tab**: Adjust control heights, border radius, padding
3. **SIEM Tab**: Customize severity levels and status colors
4. **Presets Tab**: Save/load themes, try quick presets

### **See Changes Live**
- All changes apply instantly to the preview panel
- Navigate to other pages to see changes across the entire app
- Use browser dev tools to inspect CSS variables being modified

## 🔧 Technical Implementation

### **Real-time CSS Variable Updates**
```typescript
// Applies changes directly to document root
useEffect(() => {
  const root = document.documentElement;
  root.style.setProperty('--primary', tokens.primary);
  root.style.setProperty('--radius', tokens.radius);
  // ... all other tokens
}, [tokens]);
```

### **Token Interface**
```typescript
interface DesignTokens {
  // Colors (HSL without hsl() wrapper)
  primary: string;           // "221.2 83.2% 53.3%"
  background: string;        // "0 0% 100%"
  
  // Sizing (CSS values with units)
  radius: string;            // "0.75rem"
  controlHMd: string;        // "2.25rem"
  
  // SIEM tokens
  sevCritical: string;       // "0 84% 60%"
  statusOk: string;          // "142 72% 29%"
}
```

### **Component Integration**
All components automatically inherit token changes because they use CSS variables:
```tsx
// Button component uses tokens
<Button className="h-[var(--control-h-md)] rounded-[var(--radius)]" />

// Changes to tokens immediately affect all buttons
```

## 🎨 Token Categories

### **Core Colors** (HSL format without `hsl()`)
- `primary`: Main brand color
- `background`: Page background
- `foreground`: Main text color
- `secondary`: Secondary elements
- `muted`: Subtle backgrounds
- `accent`: Highlight color
- `destructive`: Error/danger color

### **Control Sizing** (CSS values with units)
- `radius`: Global border radius
- `controlHSm/Md/Lg`: Small/Medium/Large control heights
- `controlPxSm/Md/Lg`: Small/Medium/Large padding
- `controlFsSm/Md/Lg`: Small/Medium/Large font sizes

### **SIEM Semantic Tokens** (HSL format)
- `sevCritical/High/Medium/Low`: Severity level colors
- `statusOk/Warn/Bad`: Status indicator colors

## 🔄 Export/Import System

### **Export Theme**
```typescript
// Creates downloadable JSON file
const exportTokens = () => {
  const blob = new Blob([JSON.stringify(tokens, null, 2)], { 
    type: 'application/json' 
  });
  // Downloads as "theme-{name}.json"
};
```

### **Import Theme**
```typescript
// Loads JSON file and merges with defaults
const importTokens = (file) => {
  const imported = JSON.parse(fileContent);
  setTokens({ ...defaultTokens, ...imported });
};
```

## 🎯 Use Cases

### **Brand Customization**
- Quickly apply corporate color schemes
- Test different visual treatments
- Create themed environments for different customers

### **Accessibility Testing**
- Test contrast ratios with different color combinations
- Adjust sizing for different user needs
- Validate designs across color variations

### **Design System Development**
- Rapidly prototype new visual directions
- Test component behavior with extreme values
- Validate token relationships

### **Theme Development**
- Create seasonal themes
- Develop dark/light mode variations
- Build specialized UI treatments for different contexts

## 🚀 Live Demo Workflow

1. **Navigate** to `/ui/v3/theme`
2. **Modify** any token value (e.g., change radius from "0.75rem" to "2rem")
3. **Watch** all preview components update instantly
4. **Navigate** to other pages (Search, Dashboard) to see changes everywhere
5. **Export** your custom theme or reset to defaults

## 💡 Pro Tips

- **HSL Format**: Use HSL values without the `hsl()` wrapper (e.g., "221.2 83.2% 53.3%")
- **CSS Units**: Include units for sizing tokens (rem, px, em)
- **Extreme Testing**: Try extreme values to test component robustness
- **Cross-Page Testing**: Navigate between pages to see global consistency
- **Browser DevTools**: Inspect elements to see CSS variables being applied

The Theme Customizer transforms design token management from a developer task into an interactive, visual experience! 🎉
