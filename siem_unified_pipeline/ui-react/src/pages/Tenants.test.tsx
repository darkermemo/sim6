import { render, screen } from '@testing-library/react'
import TenantsPage from './Tenants'

vi.mock('../lib/query', () => ({
  useTenants: () => ({ data: { tenants: [{ id: 'default' }] }, isLoading: false }),
  useTenantLimits: () => ({ data: { eps_limit: 50, burst_limit: 100, retention_days: 30 } }),
  useUpdateTenantLimits: () => ({ isPending: false, mutate: vi.fn() })
}))

it('renders tenants page skeleton', () => {
  render(<TenantsPage />)
  expect(screen.getByText('Tenants')).toBeInTheDocument()
  expect(screen.getByText('default')).toBeInTheDocument()
})


