-- ========================================================================
-- KORSIQ MIGRATION: DOCUMENT CHUNKS FOR 50MB LARGE FILE PROCESSING
-- Migration: 20261113_document_chunks.sql
-- ========================================================================

-- 1. Document Chunks Table
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id TEXT NULL,
  chunk_index INT NOT NULL,
  page_start INT NULL,
  page_end INT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for high-speed retrieval by file and caller
CREATE INDEX IF NOT EXISTS idx_document_chunks_file_chunk
  ON public.document_chunks(file_id, chunk_index ASC);

CREATE INDEX IF NOT EXISTS idx_document_chunks_user
  ON public.document_chunks(user_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_group
  ON public.document_chunks(group_id);

-- 3. Row Level Security
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Select Policy: Users read their own chunks; circle members read their circle chunks
DROP POLICY IF EXISTS "Users can read own or circle document chunks" ON public.document_chunks;
CREATE POLICY "Users can read own or circle document chunks"
  ON public.document_chunks FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      group_id IS NOT NULL AND (
        EXISTS (
          SELECT 1 FROM public.circle_members cm
          WHERE cm.circle_id = document_chunks.group_id
            AND cm.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.study_groups sg
          WHERE sg.id = document_chunks.group_id
            AND (sg.owner_id = auth.uid() OR sg.creator_id = auth.uid())
        )
      )
    )
  );

-- Insert Policy: Users can insert their own chunks; service role has full access
DROP POLICY IF EXISTS "Users can insert own document chunks" ON public.document_chunks;
CREATE POLICY "Users can insert own document chunks"
  ON public.document_chunks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Delete Policy: Users can delete their own chunks
DROP POLICY IF EXISTS "Users can delete own document chunks" ON public.document_chunks;
CREATE POLICY "Users can delete own document chunks"
  ON public.document_chunks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
