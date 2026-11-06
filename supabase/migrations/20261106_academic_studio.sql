-- ==========================================
-- KORSIQ ACADEMIC STUDIO SCHEMA & RLS
-- ==========================================

-- 1. Academic Documents Table
CREATE TABLE IF NOT EXISTS academic_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'assignment',
  subject TEXT NOT NULL DEFAULT '',
  instructions TEXT DEFAULT '',
  target_word_count INT NOT NULL DEFAULT 1500,
  current_word_count INT NOT NULL DEFAULT 0,
  citation_style TEXT NOT NULL DEFAULT 'APA',
  status TEXT NOT NULL DEFAULT 'planning',
  outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  references JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Academic Document Versions / Snapshots
CREATE TABLE IF NOT EXISTS academic_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES academic_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  title TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  word_count INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes for High-Performance Lookups
CREATE INDEX IF NOT EXISTS idx_academic_documents_user ON academic_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_academic_documents_updated ON academic_documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_academic_versions_doc ON academic_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_academic_versions_user ON academic_versions(user_id);

-- 4. Strict Row Level Security (RLS)
ALTER TABLE academic_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_versions ENABLE ROW LEVEL SECURITY;

-- Documents RLS Policies
CREATE POLICY "Users can read own academic documents"
  ON academic_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own academic documents"
  ON academic_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own academic documents"
  ON academic_documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own academic documents"
  ON academic_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Versions RLS Policies
CREATE POLICY "Users can read own document versions"
  ON academic_versions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own document versions"
  ON academic_versions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own document versions"
  ON academic_versions FOR DELETE
  USING (auth.uid() = user_id);
