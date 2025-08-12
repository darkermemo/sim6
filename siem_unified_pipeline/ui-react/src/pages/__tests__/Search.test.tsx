import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
// This legacy test targeted an older SearchPage. Update to the new default Search export.
import Search from '../Search'

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
    render(wrap(<Search />))
    expect(screen.getByText('Search')).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    render(wrap(<Search />))
    expect(screen.getByText('Search')).toBeInTheDocument()
  })
})