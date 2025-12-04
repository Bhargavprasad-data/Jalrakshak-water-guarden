-- JalRakshak Database Schema

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- PostGIS is optional - uncomment if you have PostGIS installed
-- CREATE EXTENSION IF NOT EXISTS "postgis";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'operator', -- admin, supervisor, operator, worker, villager
    whatsapp_opt_in BOOLEAN DEFAULT false,
    assigned_villages TEXT[], -- Array of village IDs
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Villages table
CREATE TABLE IF NOT EXISTS villages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    district VARCHAR(255),
    state VARCHAR(255),
    gps_lat DECIMAL(10, 8),
    gps_lon DECIMAL(11, 8),
    population INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(100) UNIQUE NOT NULL,
    village_id UUID REFERENCES villages(id),
    device_type VARCHAR(50) NOT NULL, -- flow_sensor, pressure_sensor, turbidity_sensor, pump, tank
    gps_lat DECIMAL(10, 8),
    gps_lon DECIMAL(11, 8),
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, maintenance, fault
    battery_level INTEGER,
    last_seen TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Telemetry table (time-series data)
CREATE TABLE IF NOT EXISTS telemetry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    flow_rate DECIMAL(10, 2), -- L/min
    pressure DECIMAL(10, 2), -- bar
    turbidity DECIMAL(10, 2), -- NTU
    temperature DECIMAL(5, 2), -- Celsius
    gps_lat DECIMAL(10, 8),
    gps_lon DECIMAL(11, 8),
    battery_level INTEGER,
    pump_status VARCHAR(20), -- on, off, fault
    metadata JSONB
);

-- Create index on timestamp for time-series queries
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_id ON telemetry(device_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_timestamp ON telemetry(device_id, timestamp DESC);

-- Anomalies table
CREATE TABLE IF NOT EXISTS anomalies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(100) NOT NULL,
    anomaly_type VARCHAR(50) NOT NULL, -- leak, contamination, pump_failure, low_pressure, high_turbidity
    severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
    confidence DECIMAL(5, 2), -- 0-100
    gps_lat DECIMAL(10, 8),
    gps_lon DECIMAL(11, 8),
    gps_estimate JSONB, -- Estimated leak location with confidence
    description TEXT,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    ticket_id UUID
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anomaly_id UUID REFERENCES anomalies(id),
    device_id VARCHAR(100) NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    gps_lat DECIMAL(10, 8),
    gps_lon DECIMAL(11, 8),
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    whatsapp_sent BOOLEAN DEFAULT false,
    sms_sent BOOLEAN DEFAULT false,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP
);

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id VARCHAR(50) UNIQUE NOT NULL,
    anomaly_id UUID REFERENCES anomalies(id),
    device_id VARCHAR(100) NOT NULL,
    issue_type VARCHAR(50) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL,
    gps_lat DECIMAL(10, 8),
    gps_lon DECIMAL(11, 8),
    assigned_to UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'open', -- open, accepted, in_progress, completed, closed
    accepted BOOLEAN DEFAULT false,
    accepted_at TIMESTAMP,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    worker_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Contacts table
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_code VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    role VARCHAR(50) NOT NULL, -- worker, supervisor, admin, villager, health_officer
    villages UUID[], -- Array of village IDs
    whatsapp_opt_in BOOLEAN DEFAULT true,
    verified BOOLEAN DEFAULT false,
    verification_otp VARCHAR(10),
    verification_expires_at TIMESTAMP,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(phone)
);

ALTER TABLE whatsapp_contacts
ADD COLUMN IF NOT EXISTS contact_code VARCHAR(50);

-- WhatsApp Messages log
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES whatsapp_contacts(id),
    ticket_id UUID REFERENCES tickets(id),
    message_type VARCHAR(50), -- alert, ticket_assignment, followup, response
    direction VARCHAR(20), -- outgoing, incoming
    message_text TEXT,
    response_data JSONB, -- For button responses
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    status VARCHAR(50) -- sent, delivered, read, failed
);

-- Complaints table
CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    complaint_id VARCHAR(50) UNIQUE NOT NULL,
    village_id UUID REFERENCES villages(id),
    reported_by UUID REFERENCES users(id),
    complaint_type VARCHAR(50) NOT NULL, -- no_water, low_pressure, contamination, leak, other
    description TEXT,
    gps_lat DECIMAL(10, 8),
    gps_lon DECIMAL(11, 8),
    photo_urls TEXT[],
    status VARCHAR(50) DEFAULT 'open', -- open, assigned, in_progress, resolved, closed
    assigned_to UUID REFERENCES users(id),
    ticket_id UUID REFERENCES tickets(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pipelines table (GIS)
CREATE TABLE IF NOT EXISTS pipelines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    village_id UUID REFERENCES villages(id),
    pipeline_name VARCHAR(255),
    pipeline_type VARCHAR(50), -- main_supply, distribution, branch
    geometry JSONB, -- Store as JSON instead of PostGIS geometry (works without PostGIS)
    diameter_mm INTEGER,
    material VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active', -- active, maintenance, leak_detected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for pipelines (regular index since we're using JSONB)
CREATE INDEX IF NOT EXISTS idx_pipelines_village ON pipelines(village_id);

-- Analytics cache table
CREATE TABLE IF NOT EXISTS analytics_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    cache_data JSONB NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_devices_village ON devices(village_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_device ON anomalies(device_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_type ON anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_alerts_sent ON alerts(sent_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_role ON whatsapp_contacts(role);

-- Insert default admin user (password: admin123 - change in production!)
INSERT INTO users (username, phone, password_hash, role, verified)
VALUES ('admin', '+919999999999', '$2a$10$rOzJqJqJqJqJqJqJqJqJqOqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJq', 'admin', true)
ON CONFLICT (username) DO NOTHING;





