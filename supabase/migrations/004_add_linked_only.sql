-- Mark notes that should only connect via explicit [[...]] links.
-- These notes skip content-similarity and tag-based graph edges — they are
-- "strong relation" notes whose connections are manually curated.
ALTER TABLE bori_ideation
  ADD COLUMN IF NOT EXISTS linked_only boolean DEFAULT false;
