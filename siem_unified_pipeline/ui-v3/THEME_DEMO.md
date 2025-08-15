# 🎨 Theme Customizer Demo

## Quick Start Guide

### **Step 1: Access the Theme Customizer**
1. Navigate to `http://localhost:5183/ui/v3/theme`
2. Or click "Theme" in the left navigation sidebar

### **Step 2: Try Live Editing**
1. **Change Border Radius**:
   - Go to "Sizing" tab
   - Change "Border Radius" from `0.75rem` to `2rem`
   - Watch all buttons, inputs, and cards become more rounded instantly

2. **Change Primary Color**:
   - Go to "Colors" tab  
   - Change "Primary" from `221.2 83.2% 53.3%` to `142 76% 36%` (green)
   - See all primary buttons and links turn green immediately

3. **Change Control Size**:
   - In "Sizing" tab
   - Change "Medium (md)" height from `2.25rem` to `3rem`
   - All buttons and inputs become taller

### **Step 3: Test Across Pages**
1. With changes applied, navigate to other pages:
   - `/ui/v3/search` - See search buttons with new styling
   - `/ui/v3/dashboard` - See dashboard cards with new radius
   - `/ui/v3/alerts` - See alert badges with new colors

2. **Everything updates globally!** No page refresh needed.

### **Step 4: Try Quick Presets**
1. Go to "Presets" tab
2. Click "Green Theme" - entire app turns green instantly
3. Click "Sharp Corners" - all rounded elements become square
4. Click "Reset" to restore defaults

### **Step 5: Export Your Theme**
1. Enter a name in "Preset Name" field
2. Click "Export" to download your custom theme as JSON
3. Share the file or import it later

## 🔬 Advanced Testing

### **Test Extreme Values**
- Set radius to `0rem` (sharp) or `3rem` (very round)
- Set control height to `1rem` (tiny) or `4rem` (huge)
- Use extreme colors like `0 100% 50%` (pure red)

### **Test SIEM Elements**
1. Go to "SIEM" tab
2. Change severity colors:
   - Critical: `280 100% 70%` (purple)
   - High: `60 100% 50%` (yellow)
   - Medium: `180 100% 40%` (cyan)
3. See severity badges update in preview panel

### **Cross-Browser Testing**
- Theme changes work in all modern browsers
- CSS variables provide instant updates
- No JavaScript framework restart needed

## 🎯 What to Look For

### **Instant Updates**
- **Preview Panel**: Watch components change as you type
- **Live Values**: See current token values at bottom right
- **Global Effect**: Navigate to see changes everywhere

### **Component Coverage**
All these update automatically:
- ✅ Buttons (all variants and sizes)
- ✅ Inputs and form controls
- ✅ Cards and containers
- ✅ Badges and labels
- ✅ Navigation elements
- ✅ Severity indicators
- ✅ Status icons
- ✅ Dropdown menus
- ✅ Tables and data displays

### **Consistency Check**
- All buttons should have same height within size category
- All rounded elements should use same radius
- All primary elements should use same color
- All severity levels should be visually distinct

## 🚀 Power User Tips

### **HSL Color Format**
Use HSL without `hsl()` wrapper:
- ✅ Good: `221.2 83.2% 53.3%`
- ❌ Bad: `hsl(221.2, 83.2%, 53.3%)`

### **CSS Units**
Always include units for sizing:
- ✅ Good: `0.75rem`, `24px`, `2em`
- ❌ Bad: `0.75`, `24`, `2`

### **Live CSS Inspection**
1. Open browser DevTools
2. Inspect any element
3. See CSS variables like `var(--primary)` being applied
4. Watch them change in real-time as you edit

### **Keyboard Workflow**
1. Tab through input fields quickly
2. Use up/down arrows to increment values
3. Copy/paste color values between fields

## 💡 Demo Scenarios

### **Corporate Branding**
1. Change primary to company brand color
2. Adjust radius to match brand guidelines
3. Export theme as "CompanyBrand.json"

### **Accessibility Testing**
1. Test high contrast color combinations
2. Increase control sizes for easier interaction
3. Test with screen reader tools

### **Seasonal Themes**
1. Create holiday color schemes
2. Adjust for seasonal marketing campaigns
3. Save multiple themed versions

The Theme Customizer makes design token management **visual, interactive, and instant**! 🎉
