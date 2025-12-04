# Database Setup Instructions

## Quick Setup (Using postgres superuser)

1. **Open PostgreSQL command line:**
   ```powershell
   "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres
   ```
   (Enter the password you set during PostgreSQL installation)

2. **Check existing databases:**
   ```sql
   -- List all databases
   \l
   
   -- Or use SQL query
   SELECT datname FROM pg_database;
   
   -- Check if jalrakshak database exists
   SELECT datname FROM pg_database WHERE datname = 'jalrakshak';
   ```

3. **Create the database (if it doesn't exist):**
   ```sql
   CREATE DATABASE jalrakshak;
   \c jalrakshak
   ```

3. **Create extensions:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "postgis";
   ```

4. **Run the init script:**
   ```sql
   \i C:/Users/Bharg/OneDrive/Desktop/SIH/backend/db/init.sql
   ```
   Or copy and paste the contents of `backend/db/init.sql` into psql.

5. **Update .env file:**
   - Open `backend/.env`
   - Set `DB_PASSWORD` to your PostgreSQL postgres user password
   - Default user is `postgres` (already set in .env)

6. **Start the backend:**
   ```powershell
   cd backend
   npm start
   ```

## Alternative: Create dedicated user

If you want to use a dedicated user instead of `postgres`:

1. **Create user:**
   ```sql
   CREATE USER jalrakshak WITH PASSWORD 'jalrakshak123';
   GRANT ALL PRIVILEGES ON DATABASE jalrakshak TO jalrakshak;
   ```

2. **Update .env:**
   ```
   DB_USER=jalrakshak
   DB_PASSWORD=jalrakshak123
   ```

## Useful PostgreSQL Commands

### Check Existing Databases
```sql
-- List all databases with details
\l

-- List all databases (simple)
\l+

-- List databases using SQL
SELECT datname, pg_size_pretty(pg_database_size(datname)) as size 
FROM pg_database 
ORDER BY datname;

-- Check if specific database exists
SELECT EXISTS(
   SELECT FROM pg_database 
   WHERE datname = 'jalrakshak'
);

-- Show current database
SELECT current_database();
```

### Database Information
```sql
-- Connect to a database
\c jalrakshak

-- Show tables in current database
\dt

-- Show all tables including system tables
\dt+

-- List all schemas
\dn

-- Show database size
SELECT pg_size_pretty(pg_database_size('jalrakshak'));

-- Show table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### User and Permissions
```sql
-- List all users
\du

-- Show current user
SELECT current_user;

-- Check user permissions on database
SELECT 
    datname,
    datacl 
FROM pg_database 
WHERE datname = 'jalrakshak';
```

## Troubleshooting

- **Password authentication failed:** Check that the password in `.env` matches your PostgreSQL postgres user password
- **Database does not exist:** 
  - First check: `\l` or `SELECT datname FROM pg_database;`
  - Then create: `CREATE DATABASE jalrakshak;`
- **Extension not found:** Make sure PostGIS extension is installed with PostgreSQL
- **Cannot connect to database:** Make sure PostgreSQL service is running


