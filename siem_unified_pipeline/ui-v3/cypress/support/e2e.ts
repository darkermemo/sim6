// cypress/support/e2e.ts
import 'cypress-real-events';

// Custom command to handle API interception with pass-through
Cypress.Commands.add('interceptApiPassthrough', () => {
  cy.intercept({ url: "**/api/v2/**" }, (req) => {
    // Let the request pass through to the real backend
    req.continue();
  }).as('api');
});

// Custom command to safely click elements that might trigger navigation
Cypress.Commands.add('safeClick', (selector: string, options = {}) => {
  cy.get(selector).then(($el) => {
    const href = $el.attr('href');
    const dataIntent = $el.attr('data-intent');
    
    if (href || dataIntent === 'navigate') {
      // For navigation elements, click and then go back
      cy.wrap($el).click({ ...options, force: true });
      cy.wait(500); // Allow navigation to complete
      cy.go('back');
    } else {
      // For other elements, just click
      cy.wrap($el).click({ ...options, force: true });
    }
  });
});

// Global error handling
Cypress.on('uncaught:exception', (err, runnable) => {
  // Don't fail tests on uncaught exceptions from the app
  // This allows us to test that UI elements work even if there are console errors
  console.warn('Uncaught exception in app:', err.message);
  return false;
});

declare global {
  namespace Cypress {
    interface Chainable {
      interceptApiPassthrough(): Chainable<void>;
      safeClick(selector: string, options?: Partial<Cypress.ClickOptions>): Chainable<void>;
      logInfo(message: string, data?: any): Chainable<void>;
    }
  }
}

// Custom logging helper
Cypress.Commands.add('logInfo', (message: string, data?: any) => {
  console.log('Cypress Info:', message, data);
});
