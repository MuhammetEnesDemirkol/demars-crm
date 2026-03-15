-- Fix I1: Change owner_user_id FK to ON DELETE RESTRICT
-- (prevents deleting auth users who still own a firm)
ALTER TABLE firms DROP CONSTRAINT IF EXISTS firms_owner_user_id_fkey;
ALTER TABLE firms ADD CONSTRAINT firms_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- Fix I4: Add updated_at to faqs table
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
