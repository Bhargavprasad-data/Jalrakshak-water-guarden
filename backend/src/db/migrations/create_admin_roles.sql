-- Admin Roles Migration
-- Adds support for hierarchical admin roles: super_admin, district_admin, mandal_admin, village_admin

-- Add admin role assignments to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS admin_role VARCHAR(50), -- super_admin, district_admin, mandal_admin, village_admin
ADD COLUMN IF NOT EXISTS assigned_district VARCHAR(255),
ADD COLUMN IF NOT EXISTS assigned_mandal VARCHAR(255);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_admin_role ON users(admin_role);
CREATE INDEX IF NOT EXISTS idx_users_assigned_district ON users(assigned_district);
CREATE INDEX IF NOT EXISTS idx_users_assigned_mandal ON users(assigned_mandal);

-- Add mandal column to villages table if it doesn't exist
ALTER TABLE villages 
ADD COLUMN IF NOT EXISTS mandal VARCHAR(255);

-- Create index for mandal and district
CREATE INDEX IF NOT EXISTS idx_villages_mandal ON villages(mandal);
CREATE INDEX IF NOT EXISTS idx_villages_district ON villages(district);
CREATE INDEX IF NOT EXISTS idx_villages_district_mandal ON villages(district, mandal);

-- Update existing villages to extract mandal from metadata if available
-- This is a one-time migration to populate mandal from existing data
UPDATE villages 
SET mandal = metadata->>'mandal' 
WHERE mandal IS NULL AND metadata IS NOT NULL AND metadata->>'mandal' IS NOT NULL;

