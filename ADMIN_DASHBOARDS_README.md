# Admin Dashboards Setup

This project now includes separate dashboard folders for different admin levels:

## Dashboard Structure

1. **dashboard** (Port 3001) - Village Admin Dashboard
   - Shows data for a single village based on user location
   - Uses `useNearestVillage` hook to determine village

2. **mandal-admin-dashboard** (Port 3002) - Mandal Admin Dashboard
   - Shows data for all villages in the assigned mandal
   - Filters by `assigned_mandal` from user's admin context

3. **district-admin-dashboard** (Port 3003) - District Admin Dashboard
   - Shows data for all mandals and villages in the assigned district
   - Filters by `assigned_district` from user's admin context

4. **super-admin-dashboard** (Port 3004) - Super Admin Dashboard
   - Shows data for all districts, mandals, and villages
   - No filters - sees everything

## Running the Dashboards

Each dashboard runs on its own port:

```bash
# Village Dashboard (Port 3001)
cd dashboard
npm run dev

# Mandal Admin Dashboard (Port 3002)
cd mandal-admin-dashboard
npm run dev

# District Admin Dashboard (Port 3003)
cd district-admin-dashboard
npm run dev

# Super Admin Dashboard (Port 3004)
cd super-admin-dashboard
npm run dev
```

## Database Setup

1. Run the migration to add admin roles:
```bash
cd backend
psql -U your_user -d your_database -f src/db/migrations/create_admin_roles.sql
```

2. Assign admin roles to users:
```sql
-- Super Admin
UPDATE users 
SET admin_role = 'super_admin', 
    assigned_district = NULL, 
    assigned_mandal = NULL
WHERE username = 'superadmin';

-- District Admin
UPDATE users 
SET admin_role = 'district_admin', 
    assigned_district = 'Srikakulam', 
    assigned_mandal = NULL
WHERE username = 'districtadmin';

-- Mandal Admin
UPDATE users 
SET admin_role = 'mandal_admin', 
    assigned_district = 'Srikakulam', 
    assigned_mandal = 'Mandal Name'
WHERE username = 'mandaladmin';

-- Village Admin (existing dashboard)
UPDATE users 
SET admin_role = 'village_admin', 
    assigned_district = 'Srikakulam', 
    assigned_mandal = 'Mandal Name',
    assigned_villages = ARRAY['village-uuid-here']::uuid[]
WHERE username = 'villageadmin';
```

## Backend API

The backend includes `/api/admin/*` routes for admin context and filtering:
- `GET /api/admin/context?user_id=xxx` - Get admin filter context
- `GET /api/admin/districts` - Get all districts
- `GET /api/admin/mandals?district=xxx` - Get mandals in district
- `GET /api/admin/villages?district=xxx&mandal=xxx` - Get villages with filters
- `GET /api/admin/stats?district=xxx&mandal=xxx&village_ids=xxx` - Get filtered stats

## Next Steps

Each dashboard needs to be customized to:
1. Use `useAdminContext` hook to get filter settings
2. Pass district/mandal/village filters to API calls
3. Display appropriate location selectors (district/mandal dropdowns)
4. Show aggregated data based on admin level

See `dashboard/src/hooks/useAdminContext.js` for the admin context hook.



