import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SearchPage } from '../Search'

function wrap(ui: React.ReactElement){
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SearchPage', () => {
  it('renders header and controls', () => {
    render(wrap(<SearchPage />))
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('Query and explore your security events')).toBeInTheDocument()
  })

  it('displays empty state when no tenant selected', () => {
    render(wrap(<SearchPage />))
    // Check for empty state message
    expect(screen.getByText('Choose a tenant to start')).toBeInTheDocument()
    expect(screen.getByText('Select a tenant from the dropdown above to begin searching your security events.')).toBeInTheDocument()
  })
})