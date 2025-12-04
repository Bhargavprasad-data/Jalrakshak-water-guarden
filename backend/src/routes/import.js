const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { importExcelFile } = require('../scripts/importExcel');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/', // Temporary directory for uploaded files
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) or CSV (.csv) files are allowed'));
    }
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * POST /api/import/excel
 * Upload and import Excel/CSV file to database
 * 
 * Body (multipart/form-data):
 *   - file: Excel file (.xlsx, .xls) or CSV file (.csv)
 *   - tableName: (optional) Target table name (villages, devices, users, telemetry, whatsapp_contacts)
 * 
 * Returns:
 *   - success: boolean
 *   - imported: number of records imported
 *   - errors: number of errors
 *   - message: status message
 */
router.post('/excel', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Check if user has admin or supervisor role
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'supervisor')) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(403).json({
        success: false,
        message: 'Only admin and supervisor users can import data'
      });
    }

    const filePath = req.file.path;
    const tableName = req.body.tableName || null;

    logger.info(`Import request from user ${req.user.username} for file: ${req.file.originalname}`);

    // Import the Excel file
    const result = await importExcelFile(filePath, tableName);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      imported: result.imported,
      errors: result.errors,
      message: `Successfully imported ${result.imported} records with ${result.errors} errors`
    });
  } catch (error) {
    logger.error('Excel import error:', error);

    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to import file',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/import/template
 * Download Excel template for data import
 */
router.get('/template/:table', authenticateToken, (req, res) => {
  try {
    const { table } = req.params;
    
    const templates = {
      villages: {
        headers: ['name', 'district', 'state', 'gps_lat', 'gps_lon', 'population'],
        example: ['Village A', 'District 1', 'State 1', '28.6139', '77.2090', '5000']
      },
      devices: {
        headers: ['device_id', 'village_name', 'device_type', 'gps_lat', 'gps_lon', 'status', 'battery_level'],
        example: ['DEV001', 'Village A', 'flow_sensor', '28.6139', '77.2090', 'active', '85']
      },
      users: {
        headers: ['username', 'email', 'phone', 'password', 'role', 'whatsapp_opt_in', 'assigned_villages'],
        example: ['user1', 'user1@example.com', '+919999999999', 'password123', 'operator', 'true', 'Village A, Village B']
      },
      telemetry: {
        headers: ['device_id', 'timestamp', 'flow_rate', 'pressure', 'turbidity', 'temperature', 'battery_level', 'pump_status'],
        example: ['DEV001', '2024-01-01 10:00:00', '50.5', '2.5', '1.2', '25.0', '85', 'on']
      },
      whatsapp_contacts: {
        headers: ['name', 'phone', 'role', 'villages', 'whatsapp_opt_in', 'notes'],
        example: ['John Doe', '+919999999999', 'worker', 'Village A', 'true', 'Maintenance worker']
      }
    };

    const template = templates[table];
    if (!template) {
      return res.status(400).json({
        success: false,
        message: `Template not available for table: ${table}. Available: ${Object.keys(templates).join(', ')}`
      });
    }

    // Return template as JSON (client can convert to Excel)
    res.json({
      success: true,
      table,
      headers: template.headers,
      example: template.example,
      instructions: [
        'Column names are case-insensitive and can have spaces',
        'Use village_name for devices to reference villages by name',
        'For assigned_villages and villages columns, use comma-separated village names',
        'Dates should be in format: YYYY-MM-DD HH:MM:SS or any standard date format',
        'Boolean values: true/false, yes/no, 1/0'
      ]
    });
  } catch (error) {
    logger.error('Template error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate template'
    });
  }
});

module.exports = router;

