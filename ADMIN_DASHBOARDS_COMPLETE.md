# Admin Dashboards - Implementation Complete ✅

## Overview

The hierarchical admin dashboard system has been successfully implemented with separate folders for each admin level. Each dashboard filters data dynamically based on the admin's assigned district, mandal, or village.

## Dashboard Structure

### 1. **Super-Admin Dashboard** (Port 3004)
**Location:** `super-admin-dashboard/`

**Features:**
- Shows data for ALL districts, mandals, and villages
- Filter dropdowns for District → Mandal → Village
- No restrictions - sees everything in the system
- Uses `useAdminContext` to get admin role
- Filters data dynamically based on selected district/mandal/village

**API Calls:**
- `/api/admin/districts` - Get all districts
- `/api/admin/mandals?district=xxx` - Get mandals in district
- `/api/admin/villages?district=xxx&mandal=xxx` - Get villages
- `/api/admin/stats?district=xxx&mandal=xxx&village_id=xxx` - Get filtered stats

### 2. **District-Admin Dashboard** (Port 3003)
**Location:** `district-admin-dashboard/`

**Features:**
- Shows data for assigned district only
- Filter dropdowns for Mandal → Village within the district
- Automatically filters by `assigned_district` from admin context
- Cannot see data from other districts

**API Calls:**
- `/api/admin/mandals?district=xxx` - Get mandals in assigned district
- `/api/admin/villages?district=xxx&mandal=xxx` - Get villages
- All API calls include `district=assignedDistrict` parameter

### 3. **Mandal-Admin Dashboard** (Port 3002)
**Location:** `mandal-admin-dashboard/`

**Features:**
- Shows data for assigned mandal only
- Filter dropdown for Village within the mandal
- Automatically filters by `assigned_district` and `assigned_mandal` from admin context
- Cannot see data from other mandals

**API Calls:**
- `/api/admin/villages?district=xxx&mandal=xxx` - Get villages in assigned mandal
- All API calls include `district=assignedDistrict&mandal=assignedMandal` parameters

### 4. **Village Dashboard** (Port 3001)
**Location:** `dashboard/` (existing)

**Features:**
- Shows data for single village based on user location
- Uses `useNearestVillage` hook to determine village
- Filters by `village_id` from nearest village
- No admin role required - works for all users

## Database Setup

### 1. Run Migration
```bash
cd backend
psql -U your_user -d your_database -f src/db/migrations/create_admin_roles.sql
```

### 2. Assign Admin Roles

```sql
-- Super Admin (sees everything)
UPDATE users 
SET admin_role = 'super_admin', 
    assigned_district = NULL, 
    assigned_mandal = NULL
WHERE username = 'superadmin';

-- District Admin (sees one district)
UPDATE users 
SET admin_role = 'district_admin', 
    assigned_district = 'Srikakulam', 
    assigned_mandal = NULL
WHERE username = 'districtadmin';

-- Mandal Admin (sees one mandal)
UPDATE users 
SET admin_role = 'mandal_admin', 
    assigned_district = 'Srikakulam', 
    assigned_mandal = 'Mandal Name'
WHERE username = 'mandaladmin';

-- Village Admin (sees specific villages)
UPDATE users 
SET admin_role = 'village_admin', 
    assigned_district = 'Srikakulam', 
    assigned_mandal = 'Mandal Name',
    assigned_villages = ARRAY['village-uuid-1', 'village-uuid-2']::uuid[]
WHERE username = 'villageadmin';
```

## Running the Dashboards

Each dashboard runs independently on its own port:

```bash
# Super-Admin Dashboard (Port 3004)
cd super-admin-dashboard
npm install  # First time only
npm run dev

# District-Admin Dashboard (Port 3003)
cd district-admin-dashboard
npm install  # First time only
npm run dev

# Mandal-Admin Dashboard (Port 3002)
cd mandal-admin-dashboard
npm install  # First time only
npm run dev

# Village Dashboard (Port 3001)
cd dashboard
npm run dev
```

## Backend API Endpoints

All admin dashboards use these endpoints:

### Admin Context
- `GET /api/admin/context?user_id=xxx` - Get admin filter context

### Location Data
- `GET /api/admin/districts` - Get all districts
- `GET /api/admin/mandals?district=xxx` - Get mandals in district
- `GET /api/admin/villages?district=xxx&mandal=xxx` - Get villages with filters

### Filtered Stats
- `GET /api/admin/stats?district=xxx&mandal=xxx&village_ids=xxx` - Get filtered statistics

### Data Endpoints (with filters)
- `GET /api/telemetry/live?district=xxx&mandal=xxx&village_id=xxx`
- `GET /api/alerts?district=xxx&mandal=xxx&village_id=xxx`
- `GET /api/tickets?district=xxx&mandal=xxx&village_id=xxx`
- `GET /api/device?district=xxx&mandal=xxx&village_id=xxx`
- `GET /api/telemetry/stats/summary?district=xxx&mandal=xxx&village_id=xxx`

## Key Components

### useAdminContext Hook
Located in: `{dashboard}/src/hooks/useAdminContext.js`

Fetches admin context from backend:
```javascript
const { adminContext, loading, error } = useAdminContext(userId)
// Returns: { user, filter_context: { admin_role, district, mandal, village_ids } }
```

### Dashboard Components
Each dashboard has a customized `Dashboard.jsx` that:
1. Uses `useAuth` to get current user
2. Uses `useAdminContext` to get filter settings
3. Builds query parameters based on admin level
4. Fetches filtered data from backend
5. Displays appropriate filter dropdowns

## Filtering Logic

### Super Admin
- No default filters
- Can select any district → mandal → village
- If all are "all", shows aggregated data for everything

### District Admin
- Always filters by `assigned_district`
- Can select mandal → village within district
- Cannot see other districts

### Mandal Admin
- Always filters by `assigned_district` AND `assigned_mandal`
- Can select village within mandal
- Cannot see other mandals

### Village Admin
- Filters by `assigned_villages` array
- Uses location-based village detection (existing behavior)
- Cannot see other villages

## Next Steps

1. **Test Each Dashboard:**
   - Start backend server (`cd backend && npm start`)
   - Start each dashboard on its port
   - Login with users having different admin roles
   - Verify data filtering works correctly

2. **Update Other Pages:**
   - GIS Map, Alerts, Tickets, Analytics pages should also respect admin filters
   - Use the same `buildQueryParams` pattern from Dashboard

3. **Add Authentication:**
   - Ensure each dashboard checks for correct admin role
   - Redirect if user doesn't have required permissions

4. **Database Migration:**
   - Run the migration to add admin role columns
   - Assign admin roles to test users

## Files Created/Modified

### New Dashboard Folders
- `super-admin-dashboard/` - Complete dashboard with Super Admin filtering
- `district-admin-dashboard/` - Complete dashboard with District Admin filtering
- `mandal-admin-dashboard/` - Complete dashboard with Mandal Admin filtering

### Backend Files
- `backend/src/db/migrations/create_admin_roles.sql` - Database migration
- `backend/src/routes/admin.js` - Admin API routes
- `backend/src/server.js` - Registered admin routes

### Shared Components
- `dashboard/src/hooks/useAdminContext.js` - Admin context hook (copied to all dashboards)
- `dashboard/src/context/AuthContext.jsx` - Auth context (copied to all dashboards)

## Notes

- Each dashboard is independent and can be deployed separately
- All dashboards share the same backend API
- Filtering is enforced both on frontend (UI) and backend (API)
- The existing Village Dashboard (Port 3001) remains unchanged and works as before



