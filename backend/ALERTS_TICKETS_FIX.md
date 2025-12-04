# Alerts and Tickets Display Fix

## Issue
Alerts and tickets exist in the database but were not showing on the client side (frontend).

## Root Causes Identified

1. **JOIN Query Issues**: The original queries used `JOIN` which would exclude records if related data (devices, anomalies) didn't exist. Changed to `LEFT JOIN` to include all alerts/tickets even if related data is missing.

2. **Missing Fields**: The queries were missing some fields that the frontend expected (like `location`, `confidence`, `detected_at` for alerts).

3. **Error Handling**: Frontend wasn't properly handling errors or empty responses.

## Fixes Applied

### Backend Changes

#### 1. `backend/src/services/alertService.js`
- Changed `JOIN` to `LEFT JOIN` for anomalies and devices
- Added computed `location` field (GPS coordinates)
- Added `confidence` and `detected_at` from anomalies table
- Ensures all alerts are returned even if device/anomaly data is missing

#### 2. `backend/src/services/ticketService.js`
- Changed `JOIN` to `LEFT JOIN` for all related tables
- Added `village_name` by joining with `villages` table
- Ensures all tickets are returned even if related data is missing

#### 3. `backend/src/routes/alerts.js`
- Added logging to track API calls
- Improved error messages with detailed error information

#### 4. `backend/src/routes/tickets.js`
- Added logging to track API calls
- Improved error messages with detailed error information

### Frontend Changes

#### 1. `dashboard/src/pages/Alerts.jsx`
- Added console logging for debugging
- Improved error handling with detailed error messages
- Ensured `alerts` state is always an array (even on error)

#### 2. `dashboard/src/pages/Tickets.jsx`
- Added console logging for debugging
- Improved error handling with detailed error messages
- Ensured `tickets` state is always an array (even on error)

## Testing

To verify the fixes:

1. **Check Backend Logs**:
   ```bash
   tail -f backend/logs/combined.log
   ```
   Look for "Fetching alerts" and "Fetching tickets" messages

2. **Check Browser Console**:
   - Open browser DevTools (F12)
   - Check Console tab for "Alerts response:" and "Tickets response:" logs
   - Verify data is being returned

3. **Test API Directly**:
   ```bash
   curl http://localhost:3000/api/alerts
   curl http://localhost:3000/api/tickets
   ```

4. **Check Frontend**:
   - Navigate to Alerts page - should show all alerts
   - Navigate to Tickets page - should show all tickets
   - Check browser console for any errors

## Expected Behavior

- **Alerts Page**: Shows all alerts from database, even if device/anomaly data is missing
- **Tickets Page**: Shows all tickets from database, even if related data is missing
- **Error Handling**: Shows user-friendly error messages if API calls fail
- **Empty State**: Shows "No Alerts" or "No Tickets" if database is empty

## Notes

- The queries now use `LEFT JOIN` to ensure all records are returned
- Missing related data (devices, anomalies, villages) won't prevent alerts/tickets from displaying
- Frontend now handles errors gracefully and always maintains array state
- Console logging added for easier debugging

