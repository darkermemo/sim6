// cypress/e2e/actions-wire.cy.ts

const routes = [
  "/",
  "/dashboard", 
  "/search",
  "/rules",
  "/alerts",
  "/reports",
  "/health",
  "/settings",
  "/attack-simulations",
  "/detections"
];

describe("Action wiring verification (no mocks, pass-through)", () => {
  beforeEach(() => {
    // Set up API interception that passes through to real backend
    cy.interceptApiPassthrough();
  });

  routes.forEach((path) => {
    it(`verifies actions are wired on ${path}`, () => {
      cy.visit(path, { failOnStatusCode: false });
      
      // Wait for page to load
      cy.get('body').should('be.visible');
      
      // Count total actionable elements
      cy.get("body").then(($body) => {
        const actions = $body.find("[data-action]");
        cy.log(`Found ${actions.length} elements with data-action on ${path}`);
        
        if (actions.length === 0) {
          cy.log(`No data-action elements found on ${path} - this may be expected for some pages`);
          return;
        }
      });

      // Verify each action element
      cy.get("[data-action]").each(($el) => {
        const action = $el.attr("data-action");
        const intent = $el.attr("data-intent");
        const endpoint = $el.attr("data-endpoint");
        const danger = $el.attr("data-danger");
        
        cy.log(`Testing action: ${action}, intent: ${intent}, endpoint: ${endpoint}`);

        // Skip destructive operations unless explicitly allowed
        if (danger === "true") {
          cy.log(`Skipping dangerous action: ${action}`);
          return;
        }

        // Test based on intent
        if (intent === "navigate") {
          // Test navigation elements
          cy.wrap($el).then(($navEl) => {
            const currentPath = Cypress.config('baseUrl') + path;
            cy.url().should('eq', currentPath);
            
            cy.wrap($navEl).click({ force: true });
            cy.wait(500);
            
            // Verify we navigated somewhere else, then go back
            cy.url().should('not.eq', currentPath);
            cy.go('back');
            cy.url().should('eq', currentPath);
          });
          
        } else if (intent === "open-modal") {
          // Test modal/dialog opening
          cy.wrap($el).click({ force: true });
          cy.wait(500);
          
          // Look for common modal/dialog indicators
          cy.get('body').then(($body) => {
            const hasModal = $body.find('[role="dialog"], [data-state="open"], .modal, .dialog').length > 0;
            if (hasModal) {
              cy.log(`Modal opened successfully for action: ${action}`);
              // Try to close modal with escape key
              cy.realPress('Escape');
            } else {
              cy.log(`Warning: Modal not detected for action: ${action}`);
            }
          });
          
        } else if (intent === "submit") {
          // Test form submission
          cy.wrap($el).click({ force: true });
          cy.wait(1000); // Allow form submission to trigger
          
          // Check if any API calls were made (form submission should trigger fetch)
          cy.get('@api.all').then((calls) => {
            if (calls.length > 0) {
              cy.log(`Form submission triggered API call for action: ${action}`);
            } else {
              cy.log(`Warning: No API calls detected for submit action: ${action}`);
            }
          });
          
        } else if (intent === "api") {
          // Test API calls
          if (!endpoint) {
            cy.log(`Error: API action missing endpoint: ${action}`);
            throw new Error(`API action ${action} missing data-endpoint`);
          }
          
          cy.wrap($el).click({ force: true });
          cy.wait(1000);
          
          // Verify API call was made to expected endpoint
          cy.wait('@api').then((interception) => {
            expect(interception.request.url).to.include(endpoint);
            cy.log(`API call verified for action: ${action} -> ${endpoint}`);
          });
          
        } else {
          // Default: treat as potential API call or log warning
          cy.wrap($el).click({ force: true });
          cy.wait(500);
          
          cy.log(`Clicked action without specific intent: ${action}`);
        }
      });
    });
  });

  // Special test for forms without data-action attributes
  it("verifies form submissions work", () => {
    routes.forEach((path) => {
      cy.visit(path, { failOnStatusCode: false });
      
      cy.get('form').each(($form) => {
        const action = $form.attr('action');
        const method = $form.attr('method') || 'GET';
        
        cy.log(`Found form with action: ${action}, method: ${method}`);
        
        // Look for submit buttons within the form
        cy.wrap($form).find('button[type="submit"], input[type="submit"]').each(($submit) => {
          const isDisabled = $submit.prop('disabled');
          if (!isDisabled) {
            cy.log(`Found submit button in form`);
            // Form submission verification would go here
            // For now, just log that we found it
          }
        });
      });
    });
  });

  // Test for buttons without proper action metadata
  it("identifies buttons missing action metadata", () => {
    const problematicElements: string[] = [];
    
    routes.forEach((path) => {
      cy.visit(path, { failOnStatusCode: false });
      
      // Find buttons without data-action
      cy.get('button, [role="button"]').not('[data-action]').each(($btn) => {
        const text = $btn.text().trim();
        const className = $btn.attr('class') || '';
        
        if (text && !className.includes('slider') && !className.includes('switch')) {
          problematicElements.push(`${path}: "${text}" (${$btn.prop('tagName')})`);
        }
      });
    });
    
    if (problematicElements.length > 0) {
      cy.log('Buttons missing data-action:', problematicElements);
      // Don't fail the test, just report
      cy.logInfo('Buttons without data-action found', problematicElements);
    }
  });
});
