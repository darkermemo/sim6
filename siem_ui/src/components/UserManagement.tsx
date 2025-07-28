import React, { useState, useMemo } from 'react';
import { Plus, Search, UserCheck, Shield, Eye, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { useToast } from '@/hooks/useToast';
import { useAdmin } from '@/hooks/useAdmin';
import { stopPropagation } from '@/lib/dom';
import type { UserResponse, CreateUserRequest, Role } from '@/types/api.d';

/**
 * UserManagement - Admin interface for managing SIEM users and roles
 * 
 * Features:
 * - View all users in tenant
 * - Create new users with role assignment
 * - Assign/remove roles from users
 * - Filter by role and search by email
 * - Admin-only access with authentication guard
 * 
 * Backend endpoints:
 * - GET /v1/users - List users
 * - POST /v1/users - Create user
 * - POST /v1/users/{id}/roles - Assign role
 * - GET /v1/roles - List available roles
 * 
 * @example
 * <UserManagement />
 */
export function UserManagement() {
  const { toast } = useToast();
  const { users, roles, loading, error, createUser, assignRole, refetchUsers } = useAdmin();
  
  // State for filters and UI
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [isAssignRoleDrawerOpen, setIsAssignRoleDrawerOpen] = useState(false);

  // New user form state
  const [newUser, setNewUser] = useState<CreateUserRequest>({
    user_id: '',
    tenant_id: 'tenant-A',
    email: '',
    roles: []
  });

  // Role assignment state
  const [selectedRole, setSelectedRole] = useState('');

  // Memoize filtered results
  const filteredUsers = useMemo(() => {
    return users.filter((user: UserResponse) => {
      const matchesSearch = !searchQuery || 
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.user_id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesRole = roleFilter === 'all' || user.roles.includes(roleFilter);
      
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  // Handle create user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUser.email || !newUser.user_id) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createUser(newUser);
      await refetchUsers();
      
      toast({
        title: 'User Created',
        description: `User ${newUser.email} created successfully`,
        variant: 'success',
      });

      setIsCreateDrawerOpen(false);
      setNewUser({ user_id: '', tenant_id: 'tenant-A', email: '', roles: [] });
    } catch (error) {
      toast({
        title: 'Creation Failed',
        description: 'Failed to create user. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle role assignment
  const handleAssignRole = async () => {
    if (!selectedUser || !selectedRole) return;

    try {
      await assignRole({ role_name: selectedRole });
      await refetchUsers();

      toast({
        title: 'Role Assigned',
        description: `Role "${selectedRole}" assigned to ${selectedUser.email}`,
        variant: 'success',
      });

      setIsAssignRoleDrawerOpen(false);
      setSelectedRole('');
      setSelectedUser(null);
    } catch (error) {
      toast({
        title: 'Assignment Failed',
        description: 'Failed to assign role. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Get role badge variant
  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'Admin': return 'critical';
      case 'Analyst': return 'default';
      case 'Viewer': return 'secondary';
      default: return 'outline';
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading users: {error}</p>
          <Button onClick={() => refetchUsers()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">User Management</h1>
        </div>
        
        <Button 
          onClick={() => setIsCreateDrawerOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create User
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-64">
            <label htmlFor="user-search" className="sr-only">Search users</label>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="user-search"
              type="text"
              placeholder="Search by email or user ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
            />
          </div>

          {/* Role Filter */}
          <span className="text-sm font-medium text-gray-700">Role Filter:</span>
          <Select 
            value={roleFilter} 
            onValueChange={setRoleFilter}
            aria-label="Filter by role"
          >
            <option value="all">All Roles</option>
            {roles.map((role) => (
              <option key={role.role_name} value={role.role_name}>{role.role_name}</option>
            ))}
          </Select>

          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {filteredUsers.length} of {users.length} users
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 font-medium">User</th>
                <th className="text-left p-4 font-medium">Roles</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Created</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No users found matching your filters
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user: UserResponse) => (
                  <tr 
                    key={user.user_id} 
                    className="border-b border-border hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedUser(user)}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{user.email}</div>
                          <div className="text-sm text-muted-foreground">
                            ID: {user.user_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1 flex-wrap">
                        {user.roles.map((role) => (
                          <Badge key={role} variant={getRoleBadgeVariant(role)}>
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={user.is_active ? 'success' : 'secondary'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                        {/* Created date not available from API */}
                        N/A
                      </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={stopPropagation(() => {
                            setSelectedUser(user);
                            setIsAssignRoleDrawerOpen(true);
                          })}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={stopPropagation(() => {
                            // View user details functionality
                            toast({
                              title: 'Feature Coming Soon',
                              description: 'User detail view will be available in a future update',
                            });
                          })}
                          className="text-gray-600 hover:text-gray-700"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create User Drawer */}
      <Sheet open={isCreateDrawerOpen} onOpenChange={setIsCreateDrawerOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New User
            </SheetTitle>
            <SheetDescription>
              Add a new user account to your SIEM tenant
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreateUser} className="space-y-6 mt-6">
            <div className="space-y-2">
              <label htmlFor="user_id" className="text-sm font-medium">
                User ID *
              </label>
              <input
                type="text"
                id="user_id"
                placeholder="e.g., charlie"
                value={newUser.user_id}
                onChange={(e) => setNewUser(prev => ({ ...prev, user_id: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                placeholder="charlie@company.com"
                value={newUser.email}
                onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="initial_roles" className="text-sm font-medium">
                Initial Roles
              </label>
              <Select
                value={newUser.roles[0] || ''}
                onValueChange={(value) => setNewUser(prev => ({ ...prev, roles: value ? [value] : [] }))}
              >
                <option value="">Select a role</option>
                {roles.map((role: Role) => (
                  <option key={role.role_name} value={role.role_name}>
                    {role.role_name} - {role.description}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" className="flex-1">
                Create User
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsCreateDrawerOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Assign Role Drawer */}
      <Sheet open={isAssignRoleDrawerOpen} onOpenChange={setIsAssignRoleDrawerOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Assign Role
            </SheetTitle>
            <SheetDescription>
              Assign a new role to {selectedUser?.email}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <label htmlFor="role_select" className="text-sm font-medium">
                Select Role *
              </label>
              <Select
                value={selectedRole}
                onValueChange={setSelectedRole}
              >
                <option value="">Choose a role</option>
                {roles
                  .filter(role => !selectedUser?.roles.includes(role.role_name))
                  .map((role) => (
                    <option key={role.role_name} value={role.role_name}>
                      {role.role_name} - {role.description}
                    </option>
                  ))}
              </Select>
            </div>

            {selectedUser && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Roles</label>
                <div className="flex gap-1 flex-wrap">
                  {selectedUser.roles.map((role) => (
                    <Badge key={role} variant={getRoleBadgeVariant(role)}>
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleAssignRole} 
                disabled={!selectedRole}
                className="flex-1"
              >
                Assign Role
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setIsAssignRoleDrawerOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}