# Admin Dashboards Setup Guide

This document explains how to set up the hierarchical admin dashboard system.

## Dashboard Hierarchy

1. **Super-Admin Dashboard** (Port 3004) - All Districts, Mandals, Villages
2. **District-Admin Dashboard** (Port 3003) - All Mandals in District, All Villages in Mandals
3. **Mandal-Admin Dashboard** (Port 3002) - All Villages in Mandal
4. **Village Dashboard** (Port 3001) - Single Village (Existing Dashboard)

## Database Setup

1. Run the migration to add admin roles:
```sql
\i backend/src/db/migrations/create_admin_roles.sql
```

2. Update users table to assign admin roles:
```sql
-- Example: Create a super admin
UPDATE users 
SET admin_role = 'super_admin', 
    assigned_district = NULL, 
    assigned_mandal = NULL
WHERE username = 'admin';

-- Example: Create a district admin
UPDATE users 
SET admin_role = 'district_admin', 
    assigned_district = 'Srikakulam', 
    assigned_mandal = NULL
WHERE username = 'district_admin_user';

-- Example: Create a mandal admin
UPDATE users 
SET admin_role = 'mandal_admin', 
    assigned_district = 'Srikakulam', 
    assigned_mandal = 'Mandal Name'
WHERE username = 'mandal_admin_user';

-- Example: Create a village admin
UPDATE users 
SET admin_role = 'village_admin', 
    assigned_district = 'Srikakulam', 
    assigned_mandal = 'Mandal Name',
    assigned_villages = ARRAY['village-uuid-here']::uuid[]
WHERE username = 'village_admin_user';
```

## Backend API Endpoints

The backend now includes `/api/admin/*` routes:
- `GET /api/admin/context?user_id=xxx` - Get admin filter context
- `GET /api/admin/districts` - Get all districts
- `GET /api/admin/mandals?district=xxx` - Get mandals in district
- `GET /api/admin/villages?district=xxx&mandal=xxx` - Get villages with filters
- `GET /api/admin/stats?district=xxx&mandal=xxx&village_ids=xxx` - Get filtered stats

## Dashboard Setup

Each admin dashboard needs to be created by copying the existing dashboard and modifying:

1. **vite.config.js** - Change port (3004, 3003, 3002)
2. **Dashboard component** - Filter data based on admin level
3. **Navigation** - Show appropriate filters (district/mandal/village selectors)

## Quick Setup Commands

```bash
# Create Super-Admin Dashboard (Port 3004)
cd dashboard
cp -r . ../super-admin-dashboard
cd ../super-admin-dashboard
# Edit vite.config.js to set port: 3004
# Modify Dashboard.jsx to show all districts/mandals/villages

# Create District-Admin Dashboard (Port 3003)
cd ../dashboard
cp -r . ../district-admin-dashboard
cd ../district-admin-dashboard
# Edit vite.config.js to set port: 3003
# Modify Dashboard.jsx to filter by assigned district

# Create Mandal-Admin Dashboard (Port 3002)
cd ../dashboard
cp -r . ../mandal-admin-dashboard
cd ../mandal-admin-dashboard
# Edit vite.config.js to set port: 3002
# Modify Dashboard.jsx to filter by assigned mandal
```

## Data Filtering Logic

- **Super-Admin**: No filters, sees all data
- **District-Admin**: Filters by `assigned_district`
- **Mandal-Admin**: Filters by `assigned_district` AND `assigned_mandal`
- **Village-Admin**: Filters by `assigned_villages` array



