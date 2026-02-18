-- Add targeting columns to offers table
ALTER TABLE offers 
ADD COLUMN IF NOT EXISTS target_classes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS target_branches TEXT[] DEFAULT '{}';

-- Create an index for faster filtering (GIST is good for arrays)
CREATE INDEX IF NOT EXISTS idx_offers_target_classes ON offers USING GIN (target_classes);
CREATE INDEX IF NOT EXISTS idx_offers_target_branches ON offers USING GIN (target_branches);

-- Comment for admin clarity
COMMENT ON COLUMN offers.target_classes IS 'Array of classes: {"bac", "3eme", "2eme"}. Empty means all.';
COMMENT ON COLUMN offers.target_branches IS 'Array of branches: {"informatique", "economie", "science", "technique"}. Empty means all.';
