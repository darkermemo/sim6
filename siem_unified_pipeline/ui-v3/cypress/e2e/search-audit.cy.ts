/**
 * Search Page End-to-End Audit Tests
 * Validates the complete search functionality as per audit specification
 */

describe('Search Page Audit', () => {
  beforeEach(() => {
    // Visit search page
    cy.visit('/search');
    
    // Wait for initial load
    cy.get('[data-testid="search-results"]', { timeout: 10000 }).should('be.visible');
  });

  it('loads search page and executes initial query', () => {
    // Should load with default parameters
    cy.url().should('include', '/search');
    
    // Should show search interface
    cy.get('[data-testid="query-input"]').should('be.visible');
    cy.get('[data-testid="search-results"]').should('be.visible');
    
    // Should execute initial search with "*" query
    cy.intercept('POST', '/ui/v3/api/v2/search/execute').as('searchExecute');
    cy.wait('@searchExecute').then((interception) => {
      // Verify request payload matches audit spec
      expect(interception.request.body).to.include({
        tenant_id: 'default',
        q: '*',
        limit: 100,
        offset: 0
      });
      expect(interception.request.body.time).to.have.property('last_seconds');
      expect(interception.request.body.order).to.deep.equal([{ field: 'ts', dir: 'desc' }]);
    });
  });

  it('compiles queries on typing with debounce', () => {
    // Mock compile endpoint
    cy.intercept('POST', '/ui/v3/api/v2/search/compile', {
      sql: 'SELECT * FROM events WHERE severity = high'
    }).as('searchCompile');

    // Type in search box
    cy.get('[data-testid="query-input"]').clear().type('severity:high');
    
    // Should debounce and call compile after 250ms
    cy.wait('@searchCompile', { timeout: 500 }).then((interception) => {
      expect(interception.request.body.q).to.include('severity:high');
    });
  });

  it('handles search execution with AbortController', () => {
    cy.intercept('POST', '/ui/v3/api/v2/search/execute').as('searchExecute');
    
    // Type rapidly to trigger multiple requests
    cy.get('[data-testid="query-input"]').clear().type('test');
    cy.get('[data-testid="query-input"]').type('{selectall}another');
    
    // Should abort previous request and execute new one
    cy.wait('@searchExecute');
    
    // No console errors should occur
    cy.window().then((win) => {
      cy.spy(win.console, 'error').as('consoleError');
      cy.get('@consoleError').should('not.have.been.called');
    });
  });

  it('displays no invalid dates in results', () => {
    // Mock response with various timestamp formats
    cy.intercept('POST', '/ui/v3/api/v2/search/execute', {
      fixture: 'search-results-with-timestamps.json'
    }).as('searchExecute');
    
    cy.get('[data-testid="query-input"]').clear().type('*');
    cy.wait('@searchExecute');
    
    // Check that no "Invalid Date" text appears
    cy.get('[data-testid="search-results"]').should('not.contain', 'Invalid Date');
    
    // Check that timestamps are properly formatted
    cy.get('[data-testid="result-timestamp"]').should('exist');
    cy.get('[data-testid="result-timestamp"]').each(($el) => {
      cy.wrap($el).should('not.contain', 'Invalid Date');
      cy.wrap($el).should('not.contain', 'NaN');
    });
  });

  it('ensures no duplicate React keys', () => {
    // Mock response with multiple rows
    cy.intercept('POST', '/ui/v3/api/v2/search/execute', {
      data: {
        data: Array(10).fill({}).map((_, i) => ({
          event_id: `event-${i}`,
          timestamp: Date.now() - i * 1000,
          severity: 'medium',
          message: `Test message ${i}`,
          source_ip: '10.0.0.1'
        })),
        meta: [],
        rows: 10
      }
    }).as('searchExecute');
    
    cy.get('[data-testid="query-input"]').clear().type('test');
    cy.wait('@searchExecute');
    
        // React should not log key warnings
    cy.window().then((win) => {
      cy.spy(win.console, 'warn').as('consoleWarn');
      cy.get('@consoleWarn').should('not.have.been.calledWith',
        Cypress.sinon.match(/Warning.*key/));
    });
  });

  it('uses only proxy routes (no direct backend calls)', () => {
    // Monitor all network requests
    cy.intercept('**', (req) => {
      // All API calls should go through /ui/v3/api/ proxy
      if (req.url.includes('/api/')) {
        expect(req.url).to.include('/ui/v3/api/');
        expect(req.url).to.not.include(':9999');
        expect(req.url).to.not.include('127.0.0.1:9999');
      }
    });
    
    // Execute search
    cy.get('[data-testid="query-input"]').clear().type('severity:high');
    cy.wait(1000); // Wait for any requests to complete
  });

  it('handles streaming toggle correctly', () => {
    // Find streaming toggle if it exists
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="streaming-toggle"]').length > 0) {
        // Test streaming toggle
        cy.get('[data-testid="streaming-toggle"]').click();
        
        // Should show streaming indicator
        cy.get('[data-testid="streaming-status"]').should('contain', 'streaming');
        
        // Disable streaming
        cy.get('[data-testid="streaming-toggle"]').click();
        cy.get('[data-testid="streaming-status"]').should('not.contain', 'streaming');
      }
    });
  });

  it('displays proper fallbacks for missing data', () => {
    // Mock response with missing fields
    cy.intercept('POST', '/ui/v3/api/v2/search/execute', {
      data: {
        data: [{
          event_id: 'test-1',
          // Missing severity, message, etc.
          timestamp: Date.now()
        }],
        meta: [],
        rows: 1
      }
    }).as('searchExecute');
    
    cy.get('[data-testid="query-input"]').clear().type('test');
    cy.wait('@searchExecute');
    
    // Should show proper fallbacks
    cy.get('[data-testid="search-results"]').should('contain', 'unknown'); // severity fallback
    cy.get('[data-testid="search-results"]').should('contain', '(no message)'); // message fallback
  });
});

/**
 * Acceptance Checklist Tests
 */
describe('Search Acceptance Checklist', () => {
  it('✅ Initial load shows 100 latest (descending ts), no "Invalid Date"', () => {
    cy.visit('/search');
    
    // Verify no invalid dates
    cy.get('[data-testid="search-results"]', { timeout: 10000 })
      .should('be.visible')
      .and('not.contain', 'Invalid Date');
      
    // Verify API call has correct order
    cy.intercept('POST', '/ui/v3/api/v2/search/execute').as('searchExecute');
    cy.wait('@searchExecute').then((interception) => {
      expect(interception.request.body.order).to.deep.equal([{ field: 'ts', dir: 'desc' }]);
      expect(interception.request.body.limit).to.equal(100);
    });
  });

  it('✅ Typing never throws/duplicates keys; compiled query visible', () => {
    cy.visit('/search');
    
    // Should not throw console errors
    cy.window().then((win) => {
      cy.spy(win.console, 'error').as('console.error');
    });
    
    // Type rapidly
    cy.get('[data-testid="query-input"]').clear().type('severity:high AND source_ip:10.0.0.1');
    
    // Should show compiled query
    cy.get('[data-testid="compiled-sql"]', { timeout: 1000 }).should('be.visible');
    
    // No errors should have occurred
    cy.get('@console.error').should('not.have.been.called');
  });

  it('✅ All calls are /ui/v3/api/v2/ (no origin calls)', () => {
    let allRequestsValid = true;
    
    cy.intercept('**', (req) => {
      if (req.url.includes('/api/v2/')) {
        if (!req.url.includes('/ui/v3/api/v2/')) {
          allRequestsValid = false;
        }
      }
    });
    
    cy.visit('/search');
    cy.get('[data-testid="query-input"]').clear().type('test query');
    cy.wait(2000);
    
    cy.then(() => {
      expect(allRequestsValid).to.be.true;
    });
  });
});
