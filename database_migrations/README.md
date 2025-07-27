# Database Migration System

This directory contains versioned database migration scripts for the SIEM system.

## Migration Naming Convention

Migrations follow the pattern: `V{version}__{description}.sql`

Example:
- V001__initial_tables.sql
- V002__add_rbac_tables.sql
- V003__add_taxonomy_mappings.sql

## Usage

1. Run `../apply-migrations.sh` to apply all pending migrations
2. Run `../verify_schema.sh` to verify schema integrity

## Migration Order

Migrations are applied in numerical order based on the version number.