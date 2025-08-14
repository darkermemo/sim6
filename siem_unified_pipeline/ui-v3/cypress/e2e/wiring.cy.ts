describe('Wiring', () => {
  it('Health', () => {
    cy.request('/ui/v3/api/v2/health').its('status').should('eq',200);
  });
  it('Search executes', () => {
    cy.request('POST','/ui/v3/api/v2/search/execute',{
      tenant_id:'default', time:{ last_seconds: 600 }, q:'*', limit:1
    }).its('status').should('eq',200);
  });
  it('Aggs ok', () => {
    cy.request('POST','/ui/v3/api/v2/search/aggs',{
      tenant_id:'default', time:{ last_seconds: 600 }, q:'*'
    }).its('status').should('eq',200);
  });
});
