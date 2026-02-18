-- Add features JSONB column to offers table
ALTER TABLE offers ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';

-- Add comment for clarity
COMMENT ON COLUMN offers.features IS 'Stores offer features like { "live_access": true, "exams": true, "community": true }';

-- Optional: Update existing offers with default features
UPDATE offers SET features = '{"live_access": false, "exams": true, "community": false}' WHERE features = '{}';
