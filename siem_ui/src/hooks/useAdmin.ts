import { useState, useEffect } from 'react';
import type { 
  UserResponse, 
  CreateUserRequest, 
  AssignRoleRequest, 
  Role 
} from '../types/api';

interface UseUsersResult {
  users: UserResponse[];
  loading: boolean;
  error: string | null;
  createUser: (userData: CreateUserRequest) => Promise<UserResponse | null>;
  assignRole: (userId: string, roleData: AssignRoleRequest) => Promise<boolean>;
  refetch: () => Promise<void>;
}

interface UseUserDetailResult {
  user: UserResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseRolesResult {
  roles: Role[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

export const useUsers = (): UseUsersResult => {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/v1/users', {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data: UserResponse[] = await response.json();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (userData: CreateUserRequest): Promise<UserResponse | null> => {
    try {
      setError(null);
      
      const response = await fetch('/api/v1/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create user');
      }

      const result: UserResponse = await response.json();
      await fetchUsers(); // Refresh users list
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
      return null;
    }
  };

  const assignRole = async (userId: string, roleData: AssignRoleRequest): Promise<boolean> => {
    try {
      setError(null);
      
      const response = await fetch(`/api/v1/users/${userId}/roles`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(roleData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to assign role');
      }

      await fetchUsers(); // Refresh users list
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign role');
      return false;
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    loading,
    error,
    createUser,
    assignRole,
    refetch: fetchUsers,
  };
};

export const useUserDetail = (userId: string): UseUserDetailResult => {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/v1/users/${userId}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user details');
      }

      const data: UserResponse = await response.json();
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchUser();
    }
  }, [userId]);

  return {
    user,
    loading,
    error,
    refetch: fetchUser,
  };
};

export const useRoles = (): UseRolesResult => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/v1/roles', {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch roles');
      }

      const data: Role[] = await response.json();
      setRoles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  return {
    roles,
    loading,
    error,
    refetch: fetchRoles,
  };
};

// Combined admin hook that provides all admin functionality
export const useAdmin = () => {
  const usersResult = useUsers();
  const rolesResult = useRoles();

  const getUserDetails = async (userId: string): Promise<UserResponse | null> => {
    try {
      const response = await fetch(`/api/v1/users/${userId}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user details');
      }

      return await response.json();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to fetch user details');
    }
  };

  const assignRole = async (userId: string, roleData: AssignRoleRequest): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/users/${userId}/roles`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ role_name: roleData.role_name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to assign role');
      }

      await usersResult.refetch(); // Refresh users list
      return true;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to assign role');
    }
  };

  return {
     users: usersResult.users,
     roles: rolesResult.roles,
     loading: usersResult.loading || rolesResult.loading,
     error: usersResult.error || rolesResult.error,
     createUser: usersResult.createUser,
     assignRole,
     getUserDetails,
     refetchUsers: usersResult.refetch,
     refetchRoles: rolesResult.refetch,
   };
 };