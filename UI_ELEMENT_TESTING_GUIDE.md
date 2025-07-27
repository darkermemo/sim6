
# 🧪 COMPREHENSIVE SIEM UI ELEMENT TESTING GUIDE

## 🎯 OBJECTIVE
Test EVERY interactive element across ALL pages to ensure:
- All buttons are clickable and functional
- All inputs accept and validate data
- All dropdowns/selects work properly
- All forms submit correctly
- All modals/drawers open and close
- All navigation works
- All charts and tables are interactive
- All search and filter functionality works

## 🚀 SETUP
1. Ensure both servers are running:
   - UI Server: http://localhost:3004
   - API Server: http://localhost:8080
2. Open browser and navigate to http://localhost:3004
3. Open Developer Tools (F12)
4. Have admin token ready for API calls

## 📄 PAGE-BY-PAGE TESTING

### 1. DASHBOARD PAGE (/)
**Elements to Test:**
- [ ] Time Range Picker (dropdown)
- [ ] Severity Filter Checkboxes (Critical, High, Medium, Low)
- [ ] Refresh Button
- [ ] KPI Cards (hover effects, click actions)
- [ ] Charts (hover tooltips, click interactions)
- [ ] Recent Alerts Table (row clicks, pagination)

**Test Script:**
```javascript
// Run in browser console on Dashboard page

// Comprehensive UI Element Test Script
// Run this in the browser console on each page

class UIElementTester {
  constructor() {
    this.results = [];
    this.currentPage = window.location.pathname;
  }

  async testElement(elementId, config) {
    const result = {
      elementId,
      type: config.type,
      selector: config.selector,
      actions: config.actions,
      status: 'unknown',
      errors: []
    };

    try {
      // Find element
      const element = document.querySelector(config.selector);
      if (!element) {
        result.status = 'not-found';
        result.errors.push('Element not found in DOM');
        return result;
      }

      result.status = 'found';
      
      // Test each action
      for (const action of config.actions) {
        try {
          await this.performAction(element, action, config.type);
          result.status = 'pass';
        } catch (error) {
          result.errors.push(`Action '${action}' failed: ${error.message}`);
          result.status = 'fail';
        }
      }
      
    } catch (error) {
      result.status = 'error';
      result.errors.push(error.message);
    }

    return result;
  }

  async performAction(element, action, elementType) {
    switch (action) {
      case 'click':
        if (element.disabled) throw new Error('Element is disabled');
        element.click();
        await this.wait(100);
        break;
        
      case 'hover':
        element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await this.wait(100);
        element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        break;
        
      case 'type':
        if (elementType === 'input' || elementType === 'textarea') {
          element.focus();
          element.value = 'test input';
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
        break;
        
      case 'clear':
        if (elementType === 'input' || elementType === 'textarea') {
          element.focus();
          element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        break;
        
      case 'select':
        if (elementType === 'select') {
          const options = element.querySelectorAll('option');
          if (options.length > 1) {
            element.selectedIndex = 1;
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        break;
        
      case 'toggle':
        if (elementType === 'checkbox' || elementType === 'switch') {
          element.checked = !element.checked;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
        break;
        
      case 'scroll':
        element.scrollTop = element.scrollHeight / 2;
        await this.wait(100);
        break;
        
      case 'enter':
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        break;
        
      default:
        console.warn(`Unknown action: ${action}`);
    }
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testCurrentPage() {
    console.log(`🧪 Testing elements on page: ${this.currentPage}`);
    
    const pageTests = this.getPageTests();
    const currentPageTests = pageTests[this.currentPage] || {};
    
    for (const [elementId, config] of Object.entries(currentPageTests)) {
      console.log(`  Testing: ${elementId}`);
      const result = await this.testElement(elementId, config);
      this.results.push(result);
      
      const status = result.status === 'pass' ? '✅' : 
                    result.status === 'not-found' ? '❓' : '❌';
      console.log(`    ${status} ${elementId}: ${result.status}`);
      
      if (result.errors.length > 0) {
        console.log(`      Errors: ${result.errors.join(', ')}`);
      }
    }
    
    return this.results;
  }

  getPageTests() {
    return {
      "dashboard": {
            "url": "/",
            "elements": {
                  "time-range-picker": {
                        "type": "select",
                        "selector": "[data-testid=\"time-range-picker\"]",
                        "actions": [
                              "click",
                              "select"
                        ]
                  },
                  "severity-filter-critical": {
                        "type": "checkbox",
                        "selector": "[data-testid=\"severity-critical\"]",
                        "actions": [
                              "click",
                              "toggle"
                        ]
                  },
                  "severity-filter-high": {
                        "type": "checkbox",
                        "selector": "[data-testid=\"severity-high\"]",
                        "actions": [
                              "click",
                              "toggle"
                        ]
                  },
                  "severity-filter-medium": {
                        "type": "checkbox",
                        "selector": "[data-testid=\"severity-medium\"]",
                        "actions": [
                              "click",
                              "toggle"
                        ]
                  },
                  "severity-filter-low": {
                        "type": "checkbox",
                        "selector": "[data-testid=\"severity-low\"]",
                        "actions": [
                              "click",
                              "toggle"
                        ]
                  },
                  "refresh-button": {
                        "type": "button",
                        "selector": "[data-testid=\"refresh-button\"]",
                        "actions": [
                              "click"
                        ]
                  },
                  "kpi-total-events": {
                        "type": "card",
                        "selector": "[data-testid=\"kpi-total-events\"]",
                        "actions": [
                              "click",
                              "hover"
                        ]
                  },
                  "kpi-new-alerts": {
                        "type": "card",
                        "selector": "[data-testid=\"kpi-new-alerts\"]",
                        "actions": [
                              "click",
                              "hover"
                        ]
                  },
                  "kpi-cases-opened": {
                        "type": "card",
                        "selector": "[data-testid=\"kpi-cases-opened\"]",
                        "actions": [
                              "click",
                              "hover"
                        ]
                  },
                  "kpi-eps-live": {
                        "type": "card",
                        "selector": "[data-testid=\"kpi-eps-live\"]",
                        "actions": [
                              "click",
                              "hover"
                        ]
                  },
                  "alerts-over-time-chart": {
                        "type": "chart",
                        "selector": "[data-testid=\"alerts-over-time-chart\"]",
                        "actions": [
                              "hover",
                              "click"
                        ]
                  },
                  "top-sources-chart": {
                        "type": "chart",
                        "selector": "[data-testid=\"top-sources-chart\"]",
                        "actions": [
                              "hover",
                              "click"
                        ]
                  },
                  "recent-alerts-table": {
                        "type": "table",
                        "selector": "[data-testid=\"recent-alerts-table\"]",
                        "actions": [
                              "scroll",
                              "click"
                        ]
                  },
                  "alert-row": {
                        "type": "table-row",
                        "selector": "[data-testid^=\"alert-row-\"]",
                        "actions": [
                              "click",
                              "hover"
                        ]
                  },
                  "pagination-prev": {
                        "type": "button",
                        "selector": "[data-testid=\"pagination-prev\"]",
                        "actions": [
                              "click"
                        ]
                  },
                  "pagination-next": {
                        "type": "button",
                        "selector": "[data-testid=\"pagination-next\"]",
                        "actions": [
                              "click"
                        ]
                  }
            }
      },
      "alerts": {
            "url": "/alerts",
            "elements": {
                  "search-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Search alerts\"]",
                        "actions": [
                              "type",
                              "clear",
                              "enter"
                        ]
                  },
                  "status-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"status-filter\"]",
                        "actions": [
                              "click",
                              "select"
                        ]
                  },
                  "severity-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"severity-filter\"]",
                        "actions": [
                              "click",
                              "select"
                        ]
                  },
                  "clear-filters-button": {
                        "type": "button",
                        "selector": "button:contains(\"Clear Filters\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "refresh-button": {
                        "type": "button",
                        "selector": "button:contains(\"Refresh\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "total-alerts-card": {
                        "type": "card",
                        "selector": "[data-testid=\"total-alerts-card\"]",
                        "actions": [
                              "hover"
                        ]
                  },
                  "critical-alerts-card": {
                        "type": "card",
                        "selector": "[data-testid=\"critical-alerts-card\"]",
                        "actions": [
                              "hover"
                        ]
                  },
                  "high-alerts-card": {
                        "type": "card",
                        "selector": "[data-testid=\"high-alerts-card\"]",
                        "actions": [
                              "hover"
                        ]
                  },
                  "open-alerts-card": {
                        "type": "card",
                        "selector": "[data-testid=\"open-alerts-card\"]",
                        "actions": [
                              "hover"
                        ]
                  },
                  "alerts-table": {
                        "type": "table",
                        "selector": "table",
                        "actions": [
                              "scroll"
                        ]
                  },
                  "alert-id-cell": {
                        "type": "table-cell",
                        "selector": "td:first-child",
                        "actions": [
                              "click",
                              "copy"
                        ]
                  },
                  "rule-name-cell": {
                        "type": "table-cell",
                        "selector": "td:nth-child(2)",
                        "actions": [
                              "click"
                        ]
                  },
                  "severity-badge": {
                        "type": "badge",
                        "selector": ".severity-badge",
                        "actions": [
                              "hover"
                        ]
                  },
                  "status-badge": {
                        "type": "badge",
                        "selector": ".status-badge",
                        "actions": [
                              "hover"
                        ]
                  },
                  "view-details-button": {
                        "type": "button",
                        "selector": "button:contains(\"View\")",
                        "actions": [
                              "click"
                        ]
                  }
            }
      },
      "cases": {
            "url": "/cases",
            "elements": {
                  "create-case-button": {
                        "type": "button",
                        "selector": "button:contains(\"Create Case\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "search-cases-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Search cases\"]",
                        "actions": [
                              "type",
                              "clear"
                        ]
                  },
                  "status-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"case-status-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "priority-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"case-priority-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "assigned-to-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"assigned-to-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "cases-table": {
                        "type": "table",
                        "selector": "[data-testid=\"cases-table\"]",
                        "actions": [
                              "scroll"
                        ]
                  },
                  "case-row": {
                        "type": "table-row",
                        "selector": "[data-testid^=\"case-row-\"]",
                        "actions": [
                              "click"
                        ]
                  },
                  "edit-case-button": {
                        "type": "button",
                        "selector": "button:contains(\"Edit\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "delete-case-button": {
                        "type": "button",
                        "selector": "button:contains(\"Delete\")",
                        "actions": [
                              "click"
                        ]
                  }
            }
      },
      "rules": {
            "url": "/rules",
            "elements": {
                  "create-rule-button": {
                        "type": "button",
                        "selector": "button:contains(\"Create Rule\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "import-rule-button": {
                        "type": "button",
                        "selector": "button:contains(\"Import\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "search-rules-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Search rules\"]",
                        "actions": [
                              "type"
                        ]
                  },
                  "rule-type-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"rule-type-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "severity-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"rule-severity-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "enabled-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"enabled-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "rules-table": {
                        "type": "table",
                        "selector": "[data-testid=\"rules-table\"]",
                        "actions": [
                              "scroll"
                        ]
                  },
                  "rule-toggle": {
                        "type": "switch",
                        "selector": "[data-testid^=\"rule-toggle-\"]",
                        "actions": [
                              "toggle"
                        ]
                  },
                  "edit-rule-button": {
                        "type": "button",
                        "selector": "button:contains(\"Edit\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "delete-rule-button": {
                        "type": "button",
                        "selector": "button:contains(\"Delete\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "test-rule-button": {
                        "type": "button",
                        "selector": "button:contains(\"Test\")",
                        "actions": [
                              "click"
                        ]
                  }
            }
      },
      "log-sources": {
            "url": "/log-sources",
            "elements": {
                  "add-log-source-button": {
                        "type": "button",
                        "selector": "button:contains(\"Add Log Source\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "search-log-sources-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Search log sources\"]",
                        "actions": [
                              "type"
                        ]
                  },
                  "source-type-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"source-type-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "status-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"log-source-status-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "log-sources-table": {
                        "type": "table",
                        "selector": "[data-testid=\"log-sources-table\"]",
                        "actions": [
                              "scroll"
                        ]
                  },
                  "configure-button": {
                        "type": "button",
                        "selector": "button:contains(\"Configure\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "test-connection-button": {
                        "type": "button",
                        "selector": "button:contains(\"Test Connection\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "enable-disable-toggle": {
                        "type": "switch",
                        "selector": "[data-testid^=\"log-source-toggle-\"]",
                        "actions": [
                              "toggle"
                        ]
                  }
            }
      },
      "users": {
            "url": "/users",
            "elements": {
                  "add-user-button": {
                        "type": "button",
                        "selector": "button:contains(\"Add User\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "search-users-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Search users\"]",
                        "actions": [
                              "type"
                        ]
                  },
                  "role-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"role-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "status-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"user-status-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "users-table": {
                        "type": "table",
                        "selector": "[data-testid=\"users-table\"]",
                        "actions": [
                              "scroll"
                        ]
                  },
                  "edit-user-button": {
                        "type": "button",
                        "selector": "button:contains(\"Edit\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "reset-password-button": {
                        "type": "button",
                        "selector": "button:contains(\"Reset Password\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "deactivate-user-button": {
                        "type": "button",
                        "selector": "button:contains(\"Deactivate\")",
                        "actions": [
                              "click"
                        ]
                  }
            }
      },
      "parsers": {
            "url": "/parsers",
            "elements": {
                  "create-parser-button": {
                        "type": "button",
                        "selector": "button:contains(\"Create Parser\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "import-parser-button": {
                        "type": "button",
                        "selector": "button:contains(\"Import\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "search-parsers-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Search parsers\"]",
                        "actions": [
                              "type"
                        ]
                  },
                  "parser-type-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"parser-type-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "parsers-table": {
                        "type": "table",
                        "selector": "[data-testid=\"parsers-table\"]",
                        "actions": [
                              "scroll"
                        ]
                  },
                  "test-parser-button": {
                        "type": "button",
                        "selector": "button:contains(\"Test\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "edit-parser-button": {
                        "type": "button",
                        "selector": "button:contains(\"Edit\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "delete-parser-button": {
                        "type": "button",
                        "selector": "button:contains(\"Delete\")",
                        "actions": [
                              "click"
                        ]
                  }
            }
      },
      "interactive-parser": {
            "url": "/interactive-parser",
            "elements": {
                  "sample-log-textarea": {
                        "type": "textarea",
                        "selector": "textarea[placeholder*=\"sample log\"]",
                        "actions": [
                              "type",
                              "clear",
                              "paste"
                        ]
                  },
                  "parser-name-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Parser name\"]",
                        "actions": [
                              "type"
                        ]
                  },
                  "log-type-select": {
                        "type": "select",
                        "selector": "[data-testid=\"log-type-select\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "test-parser-button": {
                        "type": "button",
                        "selector": "button:contains(\"Test Parser\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "save-parser-button": {
                        "type": "button",
                        "selector": "button:contains(\"Save Parser\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "clear-button": {
                        "type": "button",
                        "selector": "button:contains(\"Clear\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "field-extraction-area": {
                        "type": "div",
                        "selector": "[data-testid=\"field-extraction-area\"]",
                        "actions": [
                              "click"
                        ]
                  },
                  "add-field-button": {
                        "type": "button",
                        "selector": "button:contains(\"Add Field\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "field-name-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Field name\"]",
                        "actions": [
                              "type"
                        ]
                  },
                  "field-regex-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"regex\"]",
                        "actions": [
                              "type"
                        ]
                  }
            }
      },
      "events": {
            "url": "/events",
            "elements": {
                  "search-query-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Search events\"]",
                        "actions": [
                              "type",
                              "enter"
                        ]
                  },
                  "time-range-picker": {
                        "type": "select",
                        "selector": "[data-testid=\"events-time-range\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "log-source-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"log-source-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "severity-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"events-severity-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "search-button": {
                        "type": "button",
                        "selector": "button:contains(\"Search\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "clear-search-button": {
                        "type": "button",
                        "selector": "button:contains(\"Clear\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "export-results-button": {
                        "type": "button",
                        "selector": "button:contains(\"Export\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "events-table": {
                        "type": "table",
                        "selector": "[data-testid=\"events-table\"]",
                        "actions": [
                              "scroll"
                        ]
                  },
                  "event-row": {
                        "type": "table-row",
                        "selector": "[data-testid^=\"event-row-\"]",
                        "actions": [
                              "click"
                        ]
                  },
                  "pagination-controls": {
                        "type": "pagination",
                        "selector": "[data-testid=\"pagination\"]",
                        "actions": [
                              "click"
                        ]
                  }
            }
      },
      "agent-fleet": {
            "url": "/agent-fleet",
            "elements": {
                  "download-agent-button": {
                        "type": "button",
                        "selector": "button:contains(\"Download Agent\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "search-agents-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Search agents\"]",
                        "actions": [
                              "type"
                        ]
                  },
                  "status-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"agent-status-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "policy-filter": {
                        "type": "select",
                        "selector": "[data-testid=\"policy-filter\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "agents-table": {
                        "type": "table",
                        "selector": "[data-testid=\"agents-table\"]",
                        "actions": [
                              "scroll"
                        ]
                  },
                  "agent-actions-menu": {
                        "type": "dropdown",
                        "selector": "[data-testid^=\"agent-actions-\"]",
                        "actions": [
                              "click"
                        ]
                  },
                  "assign-policy-button": {
                        "type": "button",
                        "selector": "button:contains(\"Assign Policy\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "decommission-button": {
                        "type": "button",
                        "selector": "button:contains(\"Decommission\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "view-metrics-button": {
                        "type": "button",
                        "selector": "button:contains(\"View Metrics\")",
                        "actions": [
                              "click"
                        ]
                  }
            }
      },
      "vendor-mapping": {
            "url": "/vendor-mapping",
            "elements": {
                  "add-mapping-button": {
                        "type": "button",
                        "selector": "button:contains(\"Add Mapping\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "vendor-select": {
                        "type": "select",
                        "selector": "[data-testid=\"vendor-select\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "product-select": {
                        "type": "select",
                        "selector": "[data-testid=\"product-select\"]",
                        "actions": [
                              "select"
                        ]
                  },
                  "search-mappings-input": {
                        "type": "input",
                        "selector": "input[placeholder*=\"Search mappings\"]",
                        "actions": [
                              "type"
                        ]
                  },
                  "mappings-table": {
                        "type": "table",
                        "selector": "[data-testid=\"mappings-table\"]",
                        "actions": [
                              "scroll"
                        ]
                  },
                  "edit-mapping-button": {
                        "type": "button",
                        "selector": "button:contains(\"Edit\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "delete-mapping-button": {
                        "type": "button",
                        "selector": "button:contains(\"Delete\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "test-mapping-button": {
                        "type": "button",
                        "selector": "button:contains(\"Test\")",
                        "actions": [
                              "click"
                        ]
                  }
            }
      },
      "admin": {
            "url": "/admin",
            "elements": {
                  "system-settings-tab": {
                        "type": "tab",
                        "selector": "[data-testid=\"system-settings-tab\"]",
                        "actions": [
                              "click"
                        ]
                  },
                  "security-settings-tab": {
                        "type": "tab",
                        "selector": "[data-testid=\"security-settings-tab\"]",
                        "actions": [
                              "click"
                        ]
                  },
                  "backup-settings-tab": {
                        "type": "tab",
                        "selector": "[data-testid=\"backup-settings-tab\"]",
                        "actions": [
                              "click"
                        ]
                  },
                  "save-settings-button": {
                        "type": "button",
                        "selector": "button:contains(\"Save Settings\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "reset-settings-button": {
                        "type": "button",
                        "selector": "button:contains(\"Reset\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "backup-now-button": {
                        "type": "button",
                        "selector": "button:contains(\"Backup Now\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "restore-backup-button": {
                        "type": "button",
                        "selector": "button:contains(\"Restore\")",
                        "actions": [
                              "click"
                        ]
                  },
                  "system-logs-button": {
                        "type": "button",
                        "selector": "button:contains(\"View Logs\")",
                        "actions": [
                              "click"
                        ]
                  }
            }
      }
};
  }

  generateReport() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const notFound = this.results.filter(r => r.status === 'not-found').length;
    
    console.log('
📊 Test Results Summary:');
    console.log(`Total Elements: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`❓ Not Found: ${notFound}`);
    
    return {
      total,
      passed,
      failed,
      notFound,
      results: this.results
    };
  }
}

// Auto-run test
const tester = new UIElementTester();
tester.testCurrentPage().then(() => {
  const report = tester.generateReport();
  console.log('
🎯 Copy this result to share:', JSON.stringify(report, null, 2));
});

```

### 2. ALERTS PAGE (/alerts)
**Elements to Test:**
- [ ] Search Input (type, clear, enter)
- [ ] Status Filter Dropdown
- [ ] Severity Filter Dropdown
- [ ] Clear Filters Button
- [ ] Refresh Button
- [ ] Summary Cards (hover effects)
- [ ] Alerts Table (sorting, row selection)
- [ ] View Details Buttons
- [ ] Pagination Controls

### 3. CASES PAGE (/cases)
**Elements to Test:**
- [ ] Create Case Button
- [ ] Search Cases Input
- [ ] Status Filter
- [ ] Priority Filter
- [ ] Assigned To Filter
- [ ] Cases Table
- [ ] Edit/Delete Buttons

### 4. RULES PAGE (/rules)
**Elements to Test:**
- [ ] Create Rule Button
- [ ] Import Rule Button
- [ ] Search Rules Input
- [ ] Rule Type Filter
- [ ] Severity Filter
- [ ] Enabled/Disabled Filter
- [ ] Rules Table
- [ ] Enable/Disable Toggles
- [ ] Edit/Delete/Test Buttons

### 5. LOG SOURCES PAGE (/log-sources)
**Elements to Test:**
- [ ] Add Log Source Button
- [ ] Search Input
- [ ] Source Type Filter
- [ ] Status Filter
- [ ] Log Sources Table
- [ ] Configure Button
- [ ] Test Connection Button
- [ ] Enable/Disable Toggles

### 6. USERS PAGE (/users)
**Elements to Test:**
- [ ] Add User Button
- [ ] Search Users Input
- [ ] Role Filter
- [ ] Status Filter
- [ ] Users Table
- [ ] Edit User Button
- [ ] Reset Password Button
- [ ] Deactivate User Button

### 7. PARSERS PAGE (/parsers)
**Elements to Test:**
- [ ] Create Parser Button
- [ ] Import Parser Button
- [ ] Search Parsers Input
- [ ] Parser Type Filter
- [ ] Parsers Table
- [ ] Test/Edit/Delete Buttons

### 8. INTERACTIVE PARSER PAGE (/interactive-parser)
**Elements to Test:**
- [ ] Sample Log Textarea
- [ ] Parser Name Input
- [ ] Log Type Select
- [ ] Test Parser Button
- [ ] Save Parser Button
- [ ] Clear Button
- [ ] Field Extraction Area
- [ ] Add Field Button
- [ ] Field Name/Regex Inputs

### 9. EVENTS PAGE (/events)
**Elements to Test:**
- [ ] Search Query Input
- [ ] Time Range Picker
- [ ] Log Source Filter
- [ ] Severity Filter
- [ ] Search Button
- [ ] Clear Search Button
- [ ] Export Results Button
- [ ] Events Table
- [ ] Event Row Clicks
- [ ] Pagination Controls

### 10. AGENT FLEET PAGE (/agent-fleet)
**Elements to Test:**
- [ ] Download Agent Button
- [ ] Search Agents Input
- [ ] Status Filter
- [ ] Policy Filter
- [ ] Agents Table
- [ ] Agent Actions Menu
- [ ] Assign Policy Button
- [ ] Decommission Button
- [ ] View Metrics Button

### 11. VENDOR MAPPING PAGE (/vendor-mapping)
**Elements to Test:**
- [ ] Add Mapping Button
- [ ] Vendor Select
- [ ] Product Select
- [ ] Search Mappings Input
- [ ] Mappings Table
- [ ] Edit/Delete/Test Buttons

### 12. ADMIN PAGE (/admin)
**Elements to Test:**
- [ ] System Settings Tab
- [ ] Security Settings Tab
- [ ] Backup Settings Tab
- [ ] Save Settings Button
- [ ] Reset Settings Button
- [ ] Backup Now Button
- [ ] Restore Backup Button
- [ ] View System Logs Button

## 🎭 MODAL/DRAWER TESTING

### Alert Detail Drawer
**Trigger:** Click any alert row
**Elements to Test:**
- [ ] Close Drawer Button
- [ ] Alert Severity Badge
- [ ] Alert Status Select
- [ ] Assign To Select
- [ ] Add Comment Textarea
- [ ] Save Comment Button
- [ ] Create Case Button
- [ ] Raw Event Tab
- [ ] Timeline Tab

### Rule Creation Modal
**Trigger:** Click "Create Rule" button
**Elements to Test:**
- [ ] Rule Name Input
- [ ] Rule Description Textarea
- [ ] Rule Severity Select
- [ ] Rule Type Select
- [ ] Rule Query Textarea
- [ ] Test Rule Button
- [ ] Save Rule Button
- [ ] Cancel Button

### Download Agent Sheet
**Trigger:** Click "Download Agent" button
**Elements to Test:**
- [ ] OS Select
- [ ] Architecture Select
- [ ] Download Button
- [ ] Close Sheet Button

### User Creation Modal
**Trigger:** Click "Add User" button
**Elements to Test:**
- [ ] Username Input
- [ ] Email Input
- [ ] Password Input
- [ ] Role Select
- [ ] Tenant Select
- [ ] Create User Button
- [ ] Cancel Button

## 🧭 NAVIGATION TESTING

**Elements to Test on Every Page:**
- [ ] Sidebar Toggle Button
- [ ] Dashboard Navigation Link
- [ ] Alerts Navigation Link
- [ ] Cases Navigation Link
- [ ] Rules Navigation Link
- [ ] Log Sources Navigation Link
- [ ] Users Navigation Link
- [ ] Parsers Navigation Link
- [ ] Interactive Parser Navigation Link
- [ ] Events Navigation Link
- [ ] Agent Fleet Navigation Link
- [ ] Vendor Mapping Navigation Link
- [ ] Admin Navigation Link
- [ ] User Menu Dropdown
- [ ] Logout Button

## 🔍 TESTING METHODOLOGY

### For Each Element:
1. **Visibility Check:** Is the element visible?
2. **Accessibility Check:** Can it be focused/selected?
3. **Functionality Check:** Does it perform its intended action?
4. **Error Handling:** Does it handle invalid input gracefully?
5. **Loading States:** Does it show loading indicators?
6. **Success States:** Does it show success feedback?

### For Each Action:
1. **Click Actions:** Button clicks, link clicks, row clicks
2. **Input Actions:** Text input, number input, date input
3. **Selection Actions:** Dropdown selections, checkbox toggles
4. **Keyboard Actions:** Enter key, Tab navigation, Escape key
5. **Mouse Actions:** Hover effects, drag and drop

## 📊 REPORTING

### Test Results Format:
```json
{
  "page": "dashboard",
  "timestamp": "2024-01-20T10:30:00Z",
  "elements": [
    {
      "id": "time-range-picker",
      "type": "select",
      "status": "pass",
      "actions_tested": ["click", "select"],
      "errors": []
    }
  ],
  "summary": {
    "total": 25,
    "passed": 23,
    "failed": 2,
    "not_found": 0
  }
}
```

## ✅ SUCCESS CRITERIA

**Page Level:**
- All elements are found in DOM
- All interactive elements respond to user actions
- No console errors during interactions
- All API calls complete successfully
- Loading states display appropriately
- Error states handle failures gracefully

**Application Level:**
- All pages load without errors
- Navigation between pages works
- User authentication persists
- Data consistency across pages
- Responsive design works on different screen sizes

## 🚨 CRITICAL ISSUES TO WATCH FOR

1. **Missing Elements:** Buttons/inputs not found in DOM
2. **Non-functional Elements:** Elements present but not responding
3. **JavaScript Errors:** Console errors during interactions
4. **API Failures:** Network requests failing
5. **Authentication Issues:** Token expiration or invalid permissions
6. **Data Inconsistencies:** Different data on different pages
7. **Performance Issues:** Slow loading or unresponsive UI
8. **Accessibility Issues:** Elements not keyboard accessible

## 🎯 AUTOMATION OPPORTUNITIES

After manual testing, consider automating with:
- **Playwright/Cypress:** End-to-end testing
- **Jest/Testing Library:** Component testing
- **Storybook:** Component isolation testing
- **Lighthouse:** Performance and accessibility auditing

---

**Remember:** This is not just about finding bugs, but ensuring every user interaction is smooth, intuitive, and functional. Test like a real user would use the system!
