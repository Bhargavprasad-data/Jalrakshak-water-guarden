-- Migration: Create water_supply_timings table
-- This table stores scheduled water supply timings for villages

CREATE TABLE IF NOT EXISTS water_supply_timings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    village_id UUID NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER, -- Calculated automatically
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_water_supply_timings_village ON water_supply_timings(village_id);
CREATE INDEX IF NOT EXISTS idx_water_supply_timings_day ON water_supply_timings(day_of_week);
CREATE INDEX IF NOT EXISTS idx_water_supply_timings_active ON water_supply_timings(is_active);
CREATE INDEX IF NOT EXISTS idx_water_supply_timings_village_day ON water_supply_timings(village_id, day_of_week);

-- Add comment
COMMENT ON TABLE water_supply_timings IS 'Scheduled water supply timings for villages, grouped by day of week';




