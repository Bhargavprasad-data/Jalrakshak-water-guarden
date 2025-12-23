-- Worker Registration Requests Table
-- Stores pending worker registration requests that need admin approval

CREATE TABLE IF NOT EXISTS worker_registration_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    district VARCHAR(255) NOT NULL,
    mandal VARCHAR(255),
    village_id UUID REFERENCES villages(id),
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(phone),
    UNIQUE(username)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_worker_requests_status ON worker_registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_worker_requests_created_at ON worker_registration_requests(created_at DESC);

