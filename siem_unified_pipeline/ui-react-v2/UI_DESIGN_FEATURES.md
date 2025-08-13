# SIEM UI v2 - Full Design Features

## 🎨 Design System

### Color Palette
- **Primary**: Blue (#3b82f6) - Main actions and links
- **Success**: Green (#10b981) - Positive states
- **Warning**: Orange (#f59e0b) - Caution states  
- **Error**: Red (#ef4444) - Error states
- **Grays**: 11-step scale from #f9fafb to #030712

### Typography
- **Font**: System font stack (San Francisco, Segoe UI, etc.)
- **Sizes**: Responsive scale from 0.75rem to 3rem
- **Weights**: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

### Spacing & Layout
- **Consistent spacing**: xs (0.5rem) to 2xl (3rem)
- **Container**: Max-width 1280px with responsive padding
- **Grid system**: CSS Grid with auto-fit responsive columns
- **Cards**: Rounded corners with subtle shadows

## 🌓 Dark Mode Support
- Automatic detection of system preference
- Manual toggle in header
- Smooth transitions between themes
- Proper contrast ratios for accessibility

## 🏠 Home Dashboard
- **Hero section**: Gradient text with welcome message
- **Feature cards**: Interactive hover effects with icons
  - Search Events (active)
  - Alerts (coming soon)
  - Rules (coming soon)  
  - System Health (active)
- **Quick stats**: Visual dashboard metrics
- **Responsive grid**: Adapts to screen size

## 🔍 Search Page
- **Enhanced query bar**:
  - Labeled inputs with placeholders
  - Time range dropdown with common presets
  - Disabled state when loading
  - Enter key support for quick search
- **SQL preview**:
  - Syntax highlighted display
  - Copy to clipboard button
  - Collapsible with max height
- **Results table**:
  - Responsive with horizontal scroll
  - Severity color coding
  - Timestamp formatting
  - Empty state with helpful message
  - Loading animation
- **Error handling**: 
  - Styled error messages with icons
  - Clear error descriptions

## 💚 Health Page
- **Component status cards**:
  - Visual status indicators (colored dots)
  - Status badges with backgrounds
  - Icons for each component
  - Grid layout
- **Raw response viewer**:
  - Formatted JSON display
  - Scrollable container

## 🧩 Component Features

### AppShell
- **Sticky header**: Blurred background on scroll
- **Navigation**: 
  - Active state highlighting
  - Hover effects
  - Smooth transitions
- **Logo**: Gradient text effect
- **Theme toggle**: Emoji-based light/dark switch
- **Footer**: Consistent branding

### Forms & Inputs
- **Focus states**: Blue ring with shadow
- **Hover effects**: Border color changes
- **Disabled states**: Reduced opacity
- **Labels**: Clear typography hierarchy

### Buttons
- **Primary style**: Blue with white text
- **Hover**: Elevation change with shadow
- **Active**: Pressed effect
- **Disabled**: Reduced opacity with cursor change
- **Loading**: Animated spinner icon

### Tables
- **Header styling**: Gray background
- **Row hover**: Background highlight
- **Borders**: Subtle dividers
- **Responsive**: Horizontal scroll on mobile

## 📱 Responsive Design
- **Mobile-first**: Optimized for all screen sizes
- **Breakpoints**: Automatic grid adjustments
- **Touch-friendly**: Larger tap targets on mobile
- **Readable typography**: Adjusted sizes for devices

## ⚡ Performance
- **CSS Variables**: Dynamic theming without re-renders
- **Minimal dependencies**: No heavy CSS frameworks
- **Optimized builds**: ~75KB gzipped total
- **Fast interactions**: Hardware-accelerated animations

## ♿ Accessibility
- **ARIA labels**: Proper semantic markup
- **Keyboard navigation**: Full support
- **Color contrast**: WCAG AA compliant
- **Focus indicators**: Visible for all interactions

## 🎯 UX Patterns
- **Loading states**: Consistent spinner animations
- **Empty states**: Helpful messages with icons
- **Error states**: Clear, actionable feedback
- **Success feedback**: Visual confirmation
- **Tooltips**: Additional context on hover

This design system creates a professional, modern SIEM interface that's both beautiful and highly functional, without relying on external CSS frameworks.
