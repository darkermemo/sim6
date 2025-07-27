// Script to navigate through all SIEM pages and capture console errors
// Run this in the browser console to visit each page systematically

class PageNavigator {
  constructor() {
    this.pages = [
      { name: 'Dashboard', url: '/' },
      { name: 'Alerts', url: '/alerts' },
      { name: 'Cases', url: '/cases' },
      { name: 'Rules', url: '/rules' },
      { name: 'Log Sources', url: '/log-sources' },
      { name: 'Users', url: '/users' },
      { name: 'Parsers', url: '/parsers' },
      { name: 'Interactive Parser', url: '/interactive-parser' },
      { name: 'Events', url: '/events' },
      { name: 'Agent Fleet', url: '/agent-fleet' },
      { name: 'Vendor Mapping', url: '/vendor-mapping' },
      { name: 'Admin', url: '/admin' }
    ];
    this.currentPageIndex = 0;
    this.errors = [];
  }

  captureErrors() {
    const originalError = console.error;
    const originalWarn = console.warn;
    const self = this;
    
    console.error = function(...args) {
      self.errors.push({
        type: 'error',
        page: window.location.pathname,
        message: args.join(' '),
        timestamp: new Date().toISOString()
      });
      originalError.apply(console, args);
    };
    
    console.warn = function(...args) {
      self.errors.push({
        type: 'warning', 
        page: window.location.pathname,
        message: args.join(' '),
        timestamp: new Date().toISOString()
      });
      originalWarn.apply(console, args);
    };
  }

  async navigateToPage(pageIndex) {
    if (pageIndex >= this.pages.length) {
      console.log('🏁 Navigation complete! All pages visited.');
      this.showErrorSummary();
      return;
    }

    const page = this.pages[pageIndex];
    console.log(`🧭 Navigating to: ${page.name} (${page.url})`);
    
    // Navigate to the page
    window.history.pushState({}, '', page.url);
    
    // Wait for page to load
    await this.wait(2000);
    
    console.log(`✅ Loaded: ${page.name}`);
    console.log(`📊 Current errors for this page: ${this.getPageErrors(page.url).length}`);
    
    // Move to next page
    setTimeout(() => {
      this.navigateToPage(pageIndex + 1);
    }, 3000);
  }

  getPageErrors(url) {
    return this.errors.filter(error => error.page === url);
  }

  showErrorSummary() {
    console.log('\n📋 ERROR SUMMARY BY PAGE:');
    console.log('=' .repeat(50));
    
    this.pages.forEach(page => {
      const pageErrors = this.getPageErrors(page.url);
      console.log(`\n${page.name} (${page.url}):`);
      
      if (pageErrors.length === 0) {
        console.log('  ✅ No errors detected');
      } else {
        pageErrors.forEach((error, index) => {
          console.log(`  ${index + 1}. [${error.type.toUpperCase()}] ${error.message}`);
        });
      }
    });
    
    console.log(`\n📊 Total errors across all pages: ${this.errors.length}`);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  start() {
    console.log('🚀 Starting systematic page navigation...');
    this.captureErrors();
    this.navigateToPage(0);
  }
}

// Usage instructions
console.log('📖 INSTRUCTIONS:');
console.log('1. Copy this entire script to browser console');
console.log('2. Execute: const navigator = new PageNavigator(); navigator.start();');
console.log('3. Wait for automatic navigation through all pages');
console.log('4. Review error summary at the end');
console.log('\n🎯 Ready to start navigation!');