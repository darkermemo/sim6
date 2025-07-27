import React, { useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Users, UserPlus, Shield, Settings, Eye, UserCheck } from 'lucide-react';
import type { CreateUserRequest, AssignRoleRequest, Role } from '../types/api';

const Admin: React.FC = () => {
  const { 
    users, 
    roles, 
    loading, 
    error, 
    createUser, 
    assignRole, 
    getUserDetails, 
    refetchUsers, 
    refetchRoles 
  } = useAdmin();
  
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showAssignRoleModal, setShowAssignRoleModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredUsers = users.filter(user => 
    searchTerm === '' || 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.user_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.tenant_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading admin data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card title="Error">
          <div className="text-red-600">{error}</div>
          <Button onClick={() => {
            refetchUsers();
            refetchRoles();
          }} className="mt-4">
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          Administration
        </h1>
        <div className="flex gap-2">
          <Button onClick={() => {
            refetchUsers();
            refetchRoles();
          }} variant="outline">
            Refresh
          </Button>
          {activeTab === 'users' && (
            <Button onClick={() => setShowCreateUserModal(true)} className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              New User
            </Button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users ({users.length})
            </div>
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'roles'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Roles ({roles.length})
            </div>
          </button>
        </nav>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Search */}
          <Card title="Search Users">
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Search by email, user ID, or tenant..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button 
                onClick={() => setSearchTerm('')}
                variant="outline"
              >
                Clear
              </Button>
            </div>
          </Card>

          {/* Users Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card title="Total Users">
              <div className="text-2xl font-bold">{users.length}</div>
            </Card>
            <Card title="Active Users">
              <div className="text-2xl font-bold text-green-600">
                {users.filter(u => u.is_active).length}
              </div>
            </Card>
            <Card title="Inactive Users">
              <div className="text-2xl font-bold text-red-600">
                {users.filter(u => !u.is_active).length}
              </div>
            </Card>
            <Card title="Unique Tenants">
              <div className="text-2xl font-bold text-blue-600">
                {new Set(users.map(u => u.tenant_id)).size}
              </div>
            </Card>
          </div>

          {/* Users Table */}
          <Card title={`Users (${filteredUsers.length})`}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tenant
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {filteredUsers.map((user) => (
                    <tr key={user.user_id} className="hover:bg-border">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                              <Users className="h-5 w-5 text-gray-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.email}
                            </div>
                            <div className="text-sm text-gray-500 font-mono">
                              {user.user_id.substring(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {user.tenant_id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        N/A
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <Button
                          size="sm"
                          onClick={() => setSelectedUserId(user.user_id)}
                          className="flex items-center gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedUserId(user.user_id);
                            setShowAssignRoleModal(true);
                          }}
                          className="flex items-center gap-1"
                        >
                          <UserCheck className="h-4 w-4" />
                          Assign Role
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredUsers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No users found matching the current search.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          {/* Roles Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="Total Roles">
              <div className="text-2xl font-bold">{roles.length}</div>
            </Card>
            <Card title="System Roles">
              <div className="text-2xl font-bold text-blue-600">
                {roles.filter(r => ['Admin', 'Analyst', 'Viewer'].includes(r.role_name)).length}
              </div>
            </Card>
            <Card title="Custom Roles">
              <div className="text-2xl font-bold text-purple-600">
                {roles.filter(r => !['Admin', 'Analyst', 'Viewer'].includes(r.role_name)).length}
              </div>
            </Card>
          </div>

          {/* Roles Table */}
          <Card title="Roles">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {roles.map((role) => (
                    <tr key={role.role_id} className="hover:bg-border">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Shield className="h-5 w-5 text-blue-500" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {role.role_name}
                            </div>
                            <div className="text-sm text-gray-500 font-mono">
                              {role.role_id.substring(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {role.description || 'No description'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={
                          ['Admin', 'Analyst', 'Viewer'].includes(role.role_name)
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }>
                          {['Admin', 'Analyst', 'Viewer'].includes(role.role_name) ? 'System' : 'Custom'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        N/A
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {roles.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No roles available.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <CreateUserModal 
          onClose={() => setShowCreateUserModal(false)}
          onSuccess={() => {
            setShowCreateUserModal(false);
            refetchUsers();
          }}
          createUser={createUser}
          roles={roles}
        />
      )}

      {/* Assign Role Modal */}
      {showAssignRoleModal && selectedUserId && (
        <AssignRoleModal 
          userId={selectedUserId}
          roles={roles}
          onClose={() => {
            setShowAssignRoleModal(false);
            setSelectedUserId(null);
          }}
          onSuccess={() => {
            setShowAssignRoleModal(false);
            setSelectedUserId(null);
            refetchUsers();
          }}
          assignRole={assignRole}
        />
      )}

      {/* User Detail Modal */}
      {selectedUserId && !showAssignRoleModal && (
        <UserDetailModal 
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          getUserDetails={getUserDetails}
        />
      )}
    </div>
  );
};

// Create User Modal Component
interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
  createUser: (userData: CreateUserRequest) => Promise<any>;
  roles: Role[];
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ onClose, onSuccess, createUser, roles }) => {
  const [formData, setFormData] = useState({
    user_id: '',
    tenant_id: 'tenant-A',
    email: '',
    password: '',
    roles: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const userData: CreateUserRequest = {
         user_id: formData.user_id,
         tenant_id: formData.tenant_id,
         email: formData.email,
         roles: formData.roles
       };
      const result = await createUser(userData);
      if (result) {
        onSuccess();
      } else {
        setError('Failed to create user');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-md w-full border border-border">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Create New User</h2>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email address..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Password *</label>
              <Input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter password..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <Select
                value={formData.roles[0] || ''}
                onValueChange={(value) => setFormData({ ...formData, roles: value ? [value] : [] })}
              >
                <option value="">Choose a role...</option>
                {roles.map((role) => (
                  <option key={role.role_id} value={role.role_name}>
                    {role.role_name} {role.description && `- ${role.description}`}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Assign Role Modal Component
interface AssignRoleModalProps {
  userId: string;
  roles: Role[];
  onClose: () => void;
  onSuccess: () => void;
  assignRole: (data: AssignRoleRequest) => Promise<any>;
}

const AssignRoleModal: React.FC<AssignRoleModalProps> = ({ 
  userId, 
  roles, 
  onClose, 
  onSuccess, 
  assignRole 
}) => {
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoleId) return;

    setLoading(true);
    setError(null);

    try {
      const selectedRole = roles.find(r => r.role_id === selectedRoleId);
       const result = await assignRole({ role_name: selectedRole?.role_name || '' });
      if (result) {
        onSuccess();
      } else {
        setError('Failed to assign role');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-primary-text">Assign Role</h2>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">User ID</label>
              <Input
                type="text"
                value={userId}
                disabled
                className="bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Select Role *</label>
              <Select
                required
                value={selectedRoleId}
                onValueChange={(value) => setSelectedRoleId(value)}
              >
                <option value="">Choose a role...</option>
                {roles.map((role) => (
                  <option key={role.role_id} value={role.role_id}>
                    {role.role_name} {role.description && `- ${role.description}`}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !selectedRoleId}>
                {loading ? 'Assigning...' : 'Assign Role'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// User Detail Modal Component
interface UserDetailModalProps {
  userId: string;
  onClose: () => void;
  getUserDetails: (userId: string) => Promise<any>;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ userId, onClose, getUserDetails }) => {
  const [userDetail, setUserDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const fetchUserDetail = async () => {
      try {
        const detail = await getUserDetails(userId);
        setUserDetail(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch user details');
      } finally {
        setLoading(false);
      }
    };

    fetchUserDetail();
  }, [userId, getUserDetails]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-card p-6 rounded-lg border border-border">
          <div className="text-lg text-primary-text">Loading user details...</div>
        </div>
      </div>
    );
  }

  if (error || !userDetail) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-card p-6 rounded-lg max-w-md border border-border">
          <div className="text-red-600 mb-4">{error || 'User not found'}</div>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-primary-text">User Details</h2>
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>

          <div className="space-y-6">
            <Card title="Basic Information">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">User ID</label>
                  <div className="font-mono text-sm">{userDetail.user_id}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Username</label>
                  <div className="font-medium">{userDetail.username}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Email</label>
                  <div>{userDetail.email}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Tenant ID</label>
                  <div className="font-mono text-sm">{userDetail.tenant_id}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div>
                    <Badge className={userDetail.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {userDetail.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Created At</label>
                  <div>{new Date(userDetail.created_at).toLocaleString()}</div>
                </div>
              </div>
            </Card>

            {/* Additional user details can be added here */}
            <Card title="Account Information">
              <div className="text-sm text-gray-600">
                This user account was created on {new Date(userDetail.created_at).toLocaleDateString()} and is currently {userDetail.is_active ? 'active' : 'inactive'}.
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;