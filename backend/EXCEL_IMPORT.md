# Excel Import Guide

This guide explains how to import data from Excel files into the JalRakshak database.

## Installation

First, install the required dependencies:

```bash
npm install
```

This will install the `xlsx` and `multer` packages needed for Excel file processing.

## Usage

### Method 1: Command Line Script

You can import Excel files directly from the command line:

```bash
npm run import-excel <excel-file-path> [table-name]
```

**Examples:**

```bash
# Auto-detect table from sheet name
npm run import-excel data.xlsx

# Specify table explicitly
npm run import-excel villages.xlsx villages
npm run import-excel devices.xlsx devices
npm run import-excel users.xlsx users
```

### Method 2: API Endpoint

You can upload Excel files via the API:

**Endpoint:** `POST /api/import/excel`

**Authentication:** Required (Admin or Supervisor role)

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body:
  - `file`: Excel file (.xlsx or .xls)
  - `tableName`: (optional) Target table name

**Example using curl:**

```bash
curl -X POST http://localhost:3000/api/import/excel \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@data.xlsx" \
  -F "tableName=villages"
```

**Example using JavaScript (fetch):**

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('tableName', 'villages');

fetch('http://localhost:3000/api/import/excel', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
})
.then(res => res.json())
.then(data => console.log(data));
```

**Response:**

```json
{
  "success": true,
  "imported": 50,
  "errors": 2,
  "message": "Successfully imported 50 records with 2 errors"
}
```

### Method 3: Get Template

Get a template for a specific table:

**Endpoint:** `GET /api/import/template/:table`

**Example:**

```bash
curl http://localhost:3000/api/import/template/villages \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Supported Tables

The following tables can be imported:

1. **villages** - Village information
2. **devices** - IoT device information
3. **users** - User accounts
4. **telemetry** - Sensor telemetry data
5. **whatsapp_contacts** - WhatsApp contact information

## Excel File Format

### Column Name Mapping

The import script automatically maps Excel column names to database columns. Column names are **case-insensitive** and can have spaces (which are converted to underscores).

#### Villages Table

| Excel Column | Database Column | Required | Notes |
|-------------|----------------|----------|-------|
| name, village_name | name | Yes | Village name |
| district | district | No | District name |
| state | state | No | State name |
| lat, latitude, gps_lat | gps_lat | No | GPS latitude |
| lon, longitude, gps_lon | gps_lon | No | GPS longitude |
| population | population | No | Population count |

**Example:**
```
name          | district | state | gps_lat  | gps_lon  | population
Village A     | District1| State1| 28.6139  | 77.2090  | 5000
Village B     | District1| State1| 28.6140  | 77.2091  | 3000
```

#### Devices Table

| Excel Column | Database Column | Required | Notes |
|-------------|----------------|----------|-------|
| device_id, device | device_id | Yes | Unique device identifier |
| village_id | village_id | No | Village UUID |
| village_name | village_name | No | Village name (will be resolved to village_id) |
| device_type, type | device_type | No | flow_sensor, pressure_sensor, etc. |
| lat, latitude, gps_lat | gps_lat | No | GPS latitude |
| lon, longitude, gps_lon | gps_lon | No | GPS longitude |
| status | status | No | active, inactive, maintenance, fault |
| battery_level, battery | battery_level | No | Battery percentage (0-100) |

**Example:**
```
device_id | village_name | device_type   | gps_lat  | gps_lon  | status | battery_level
DEV001    | Village A    | flow_sensor   | 28.6139  | 77.2090  | active | 85
DEV002    | Village A    | pressure_sensor| 28.6139  | 77.2090  | active | 90
```

#### Users Table

| Excel Column | Database Column | Required | Notes |
|-------------|----------------|----------|-------|
| username, user | username | Yes | Username |
| email | email | No | Email address |
| phone, mobile | phone | Yes | Phone number |
| password | password | No | Will be hashed (default: password123) |
| role | role | No | admin, supervisor, operator, worker, villager |
| whatsapp_opt_in | whatsapp_opt_in | No | true/false, yes/no, 1/0 |
| assigned_villages | assigned_villages | No | Comma-separated village names |

**Example:**
```
username | email           | phone         | password   | role      | whatsapp_opt_in | assigned_villages
user1    | user1@test.com  | +919999999999| password123| operator  | true           | Village A, Village B
user2    | user2@test.com  | +919999999998| password123| worker    | false          | Village A
```

#### Telemetry Table

| Excel Column | Database Column | Required | Notes |
|-------------|----------------|----------|-------|
| device_id, device | device_id | Yes | Device identifier |
| timestamp, date, time, datetime | timestamp | No | Date/time (default: current time) |
| flow_rate, flow | flow_rate | No | Flow rate in L/min |
| pressure | pressure | No | Pressure in bar |
| turbidity | turbidity | No | Turbidity in NTU |
| temperature, temp | temperature | No | Temperature in Celsius |
| lat, latitude, gps_lat | gps_lat | No | GPS latitude |
| lon, longitude, gps_lon | gps_lon | No | GPS longitude |
| battery_level, battery | battery_level | No | Battery percentage |
| pump_status, pump | pump_status | No | on, off, fault |

**Example:**
```
device_id | timestamp           | flow_rate | pressure | turbidity | temperature | battery_level | pump_status
DEV001    | 2024-01-01 10:00:00 | 50.5      | 2.5      | 1.2       | 25.0        | 85            | on
DEV001    | 2024-01-01 11:00:00 | 48.2      | 2.4      | 1.3       | 25.5        | 84            | on
```

#### WhatsApp Contacts Table

| Excel Column | Database Column | Required | Notes |
|-------------|----------------|----------|-------|
| name | name | Yes | Contact name |
| phone, mobile | phone | Yes | Phone number |
| role | role | No | worker, supervisor, admin, villager, health_officer |
| villages | villages | No | Comma-separated village names |
| whatsapp_opt_in | whatsapp_opt_in | No | true/false, yes/no, 1/0 |
| notes | notes | No | Additional notes |

**Example:**
```
name      | phone         | role    | villages | whatsapp_opt_in | notes
John Doe  | +919999999999 | worker  | Village A| true           | Maintenance worker
Jane Smith| +919999999998 | villager| Village B| true           |
```

## Sheet Name Detection

If you don't specify a table name, the script will try to detect it from the Excel sheet name:

- Sheet names like "villages", "village" → villages table
- Sheet names like "devices", "device" → devices table
- Sheet names like "users", "user" → users table
- Sheet names like "telemetry", "telemetry_data" → telemetry table
- Sheet names like "contacts", "contact", "whatsapp" → whatsapp_contacts table

## Behavior

### Update vs Insert

- **Villages**: Updates existing villages by name (case-insensitive)
- **Devices**: Updates existing devices by device_id
- **Users**: Updates existing users by username or phone
- **Telemetry**: Always inserts new records (no updates)
- **WhatsApp Contacts**: Updates existing contacts by phone number

### Data Validation

- Required fields are checked before import
- Invalid data types are skipped with warnings
- GPS coordinates are validated as numbers
- Dates are parsed automatically
- Boolean values accept: true/false, yes/no, 1/0

### Error Handling

- Errors are logged but don't stop the import process
- Each row is processed independently
- Summary shows total imported and error counts

## Tips

1. **Use village names instead of IDs**: For devices and contacts, you can use village names instead of UUIDs - the script will resolve them automatically.

2. **Multiple sheets**: You can have multiple sheets in one Excel file, each for a different table.

3. **Column flexibility**: Column names are flexible - "GPS Lat", "gps_lat", "Latitude" all work.

4. **Date formats**: Dates can be in various formats - Excel dates, ISO format, or common date strings.

5. **Comma-separated lists**: For fields like `assigned_villages` and `villages`, use comma-separated values: "Village A, Village B".

## Troubleshooting

**Error: "File not found"**
- Check the file path is correct
- Use absolute path if relative path doesn't work

**Error: "Unknown table type"**
- Specify the table name explicitly: `npm run import-excel data.xlsx villages`
- Or rename your sheet to match expected names

**Error: "Missing required field"**
- Check that required columns are present in your Excel file
- Required fields: villages (name), devices (device_id), users (username, phone), telemetry (device_id), contacts (name, phone)

**Error: "Database connection failed"**
- Ensure PostgreSQL is running
- Check database credentials in `.env` file

**No data imported**
- Check that your data rows are not empty
- Verify column names match expected names (case-insensitive)
- Check logs for specific error messages

## Security Notes

- Only admin and supervisor users can import data via API
- Passwords are automatically hashed using bcrypt
- Uploaded files are automatically deleted after processing
- File size limit: 10MB




