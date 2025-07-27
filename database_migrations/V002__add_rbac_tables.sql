-- V002: Role-Based Access Control (RBAC) tables
-- Creates users, roles, and user_roles tables for authentication and authorization

-- Users table: Stores user account information
CREATE TABLE IF NOT EXISTS dev.users (
    user_id String,
    tenant_id String,
    email String,
    password_hash String,
    is_active UInt8 DEFAULT 1,
    created_at UInt32,
    updated_at UInt32 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (tenant_id, user_id);

-- Roles table: Defines available roles in the system
CREATE TABLE IF NOT EXISTS dev.roles (
    role_id String,
    role_name String,
    description String
) ENGINE = MergeTree()
ORDER BY role_id;

-- User roles table: Maps users to their assigned roles
CREATE TABLE IF NOT EXISTS dev.user_roles (
    user_id String,
    tenant_id String,
    role_name String
) ENGINE = MergeTree()
ORDER BY (tenant_id, user_id);

-- Insert default roles
INSERT INTO dev.roles (role_id, role_name, description) VALUES
('admin', 'Admin', 'Full system administration access'),
('analyst', 'Analyst', 'Security analysis and investigation'),
('viewer', 'Viewer', 'Read-only access to events and reports'),
('superadmin', 'SuperAdmin', 'Global system administration across tenants');

-- Insert default users for testing
INSERT INTO dev.users (user_id, tenant_id, email, password_hash, is_active, created_at) VALUES
('alice', 'tenant-A', 'alice@orga.com', 'hashed_password_1', 1, toUnixTimestamp(now())),
('bob', 'tenant-A', 'bob@orga.com', 'hashed_password_2', 1, toUnixTimestamp(now())),
('charlie', 'tenant-A', 'charlie@orga.com', 'hashed_password_3', 1, toUnixTimestamp(now())),
('david', 'tenant-B', 'david@orgb.com', 'hashed_password_4', 1, toUnixTimestamp(now())),
('superadmin', 'global', 'admin@system.com', 'hashed_password_super', 1, toUnixTimestamp(now()));

-- Assign roles to users
INSERT INTO dev.user_roles (user_id, tenant_id, role_name) VALUES
('alice', 'tenant-A', 'Admin'),
('bob', 'tenant-A', 'Analyst'),
('charlie', 'tenant-A', 'Viewer'),
('david', 'tenant-B', 'Admin'),
('superadmin', 'global', 'SuperAdmin');