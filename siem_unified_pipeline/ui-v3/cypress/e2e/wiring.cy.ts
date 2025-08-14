describe('Wiring', () => {
  it('Health', () => {
    cy.request('/api/v2/health').its('status').should('eq',200);
  });
  it('Search executes', () => {
    cy.request('POST','/api/v2/search/execute',{
      tenant_id:'default', time:{ last_seconds: 600 }, q:'*', limit:1
    }).its('status').should('eq',200);
  });
  it('Aggs ok', () => {
    cy.request('POST','/api/v2/search/aggs',{
      tenant_id:'default', time:{ last_seconds: 600 }, q:'*'
    }).its('status').should('eq',200);
  });
});
