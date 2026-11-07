-- ==========================================
-- ADD STATUS COLUMN TO USER_FILES
-- Supports real Ready / Processing status tag in Resources view
-- ==========================================

ALTER TABLE IF EXISTS user_files 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ready';
