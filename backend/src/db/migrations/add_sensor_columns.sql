-- Migration: Add comprehensive sensor parameter columns to telemetry table
-- This adds all water quality and sensor parameters as proper columns

-- Add new columns to telemetry table
ALTER TABLE telemetry 
  ADD COLUMN IF NOT EXISTS ph DECIMAL(5, 3),
  ADD COLUMN IF NOT EXISTS conductivity DECIMAL(10, 3), -- µS/cm
  ADD COLUMN IF NOT EXISTS tds DECIMAL(10, 3), -- mg/L
  ADD COLUMN IF NOT EXISTS do_mg_l DECIMAL(10, 3), -- Dissolved Oxygen mg/L
  ADD COLUMN IF NOT EXISTS residual_chlorine DECIMAL(10, 3), -- mg/L
  ADD COLUMN IF NOT EXISTS orp DECIMAL(10, 2), -- mV
  ADD COLUMN IF NOT EXISTS ammonium DECIMAL(10, 4), -- mg/L
  ADD COLUMN IF NOT EXISTS nitrate DECIMAL(10, 4), -- mg/L
  ADD COLUMN IF NOT EXISTS chloride DECIMAL(10, 3), -- mg/L
  ADD COLUMN IF NOT EXISTS tss DECIMAL(10, 3), -- Total Suspended Solids mg/L
  ADD COLUMN IF NOT EXISTS cod DECIMAL(10, 2), -- Chemical Oxygen Demand mg/L
  ADD COLUMN IF NOT EXISTS bod DECIMAL(10, 3), -- Biological Oxygen Demand mg/L
  ADD COLUMN IF NOT EXISTS toc DECIMAL(10, 3); -- Total Organic Carbon mg/L

-- Add indexes for commonly queried parameters
CREATE INDEX IF NOT EXISTS idx_telemetry_ph ON telemetry(ph);
CREATE INDEX IF NOT EXISTS idx_telemetry_turbidity ON telemetry(turbidity);
CREATE INDEX IF NOT EXISTS idx_telemetry_temperature ON telemetry(temperature);
CREATE INDEX IF NOT EXISTS idx_telemetry_pressure ON telemetry(pressure);

-- Add comment to metadata column explaining it's for additional/extended parameters
COMMENT ON COLUMN telemetry.metadata IS 'JSONB field for additional sensor parameters and extended data';

