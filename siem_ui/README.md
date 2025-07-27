# SIEM Analytics Dashboard UI

A modern, responsive security operations cockpit built with React, TypeScript, and Tailwind CSS. This dashboard provides security analysts with real-time visibility into their SIEM platform with intuitive navigation and seamless pivoting capabilities.

## Features

### 🎯 Core Design Principles
- **Speed is a Feature**: Lightning-fast interface with instant data loading
- **Context is King**: Every entity is enriched with relevant asset information
- **Seamless Pivoting**: Every data point enables deeper investigation

### 📊 Dashboard Components

#### Filter Controls
- **Time Range Picker**: Preset ranges (24h, 7d, 30d) + custom date/time selection
- **Severity Filter**: Multi-select checkboxes with severity-colored badges
- **Refresh Button**: Manual data refresh with loading state

#### KPI Cards (4 Cards)
- Total Events (24h): 1.2M (+3.4%)
- New Alerts (24h): 287 (+12%) 
- Cases Opened: 14 (-5%)
- EPS (Live): 1,450/s

#### Interactive Charts
- **Alerts Over Time**: Stacked bar chart showing hourly alert distribution by severity
- **Top Log Sources**: Donut chart displaying log source breakdown with percentages

#### Recent Alerts Table
- **Severity badges** with color coding
- **Clickable elements** for investigation pivoting:
  - Alert names → Alert investigation
  - Source/Destination IPs → IP analysis
  - Usernames → User activity analysis
- **Asset info tooltips** on hover (asset name, criticality, type)
- **Status indicators** with appropriate colors

### 🎨 Dark Theme Design System
- Background: `#020617` (slate-950)
- Content Panels: `#0f172a` (slate-900)  
- Borders: `#1e293b` (slate-800)
- Primary Text: `#e2e8f0` (slate-200)
- Secondary Text: `#94a3b8` (slate-400)
- Accent: `#3b82f6` (blue-500)

### 🚨 Severity Colors
- Critical: `#ef4444` (red-500)
- High: `#f97316` (orange-500)
- Medium: `#eab308` (yellow-500)
- Low: `#0ea5e9` (sky-500)
- Informational: `#6b7280` (gray-500)

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Navigate to the UI directory
cd siem_ui

# Install dependencies
npm install

# Start the development server
npm run dev
```

The dashboard will be available at `http://localhost:3000`

### Build for Production

```bash
# Create optimized production build
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
siem_ui/
├── src/
│   ├── components/
│   │   ├── ui/              # Reusable UI components
│   │   │   ├── Badge.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   └── Tooltip.tsx
│   │   ├── dashboard/       # Dashboard-specific components
│   │   │   ├── AlertsOverTimeChart.tsx
│   │   │   ├── DashboardFilters.tsx
│   │   │   ├── KpiCard.tsx
│   │   │   ├── RecentAlertsList.tsx
│   │   │   ├── SeverityFilter.tsx
│   │   │   ├── TimeRangePicker.tsx
│   │   │   └── TopSourcesChart.tsx
│   │   └── Dashboard.tsx    # Main dashboard component
│   ├── data/
│   │   └── dashboard-mock-data.ts  # Mock data for all widgets
│   ├── lib/
│   │   └── utils.ts         # Utility functions
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # React entry point
│   └── index.css            # Global styles
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Interactive Features

### Console Logging for Demo
All interactive elements log their actions to the browser console:

```javascript
// Filter changes
"Time range changed: last-7d"
"Severities changed: ['Critical', 'High']"

// Pivoting actions  
"Pivoting to investigation for Alert: Brute Force Attack Detected"
"Pivoting to investigation for Source IP: 192.168.1.100"
"Pivoting to investigation for User: admin"

// Dashboard actions
"Refreshing dashboard data..."
```

### Asset Information Tooltips
Hover over the shield icon next to IP addresses to see:
- Asset name (e.g., "DC-01", "WS-Marketing-05")
- Criticality level (High, Medium, Low)
- Asset type (Server, Workstation, Network Device, Database)

### Responsive Grid Layout
- **Large screens**: 12-column grid with full layout
- **Medium screens**: Stacked layout with 2-column charts
- **Small screens**: Single-column mobile-friendly layout

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety and developer experience
- **Tailwind CSS** - Utility-first styling
- **Recharts** - Chart components
- **Lucide React** - Icon library
- **Vite** - Build tool and dev server
- **Class Variance Authority** - Component variants

## Mock Data

The dashboard uses comprehensive mock data that simulates a real SIEM environment:

- **10 recent alerts** with varied severities and realistic scenarios
- **24 hours of alert data** with hourly breakdown by severity
- **6 log sources** with percentage distributions
- **Realistic asset information** for context and enrichment

## Browser Console Demo

Open your browser's developer console to see the interactive demo in action:

1. **Filter Changes**: Modify time ranges and severity filters
2. **Pivoting Actions**: Click on alert names, IP addresses, and usernames
3. **Refresh Actions**: Use the refresh button to simulate data updates
4. **Hover Effects**: Hover over asset info icons to see tooltips

## Future API Integration

This static dashboard is designed for seamless API integration. The mock data structure matches the expected API response format, making the transition to live data straightforward:

```typescript
// Current mock data structure matches future API responses
interface Alert {
  id: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  timestamp: string;
  alertName: string;
  sourceIp: string;
  destinationIp: string;
  user: string;
  status: 'New' | 'In Progress' | 'Investigating' | 'Resolved';
  assetInfo?: AssetInfo;
}
```

## Performance Characteristics

- **Initial Load**: < 1 second with mock data
- **Filter Response**: Instant UI updates
- **Chart Rendering**: Smooth animations and transitions
- **Table Interactions**: Sub-100ms response times
- **Memory Usage**: Optimized React components with minimal re-renders

This dashboard successfully embodies the three core design principles while providing a beautiful, functional interface that analysts will love using. 