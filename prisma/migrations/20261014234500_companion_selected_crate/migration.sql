ALTER TABLE "CompanionLibrarySnapshot"
  ADD COLUMN "requestedPlaylistId" TEXT,
  ADD COLUMN "requestedPlaylistAt" TIMESTAMP(3),
  ADD COLUMN "selectedPlaylist" JSONB,
  ADD COLUMN "selectedPlaylistAt" TIMESTAMP(3);

-- Remove any previously synced full-library track lists. Preserve crate
-- identity and counts so users can select a crate without re-pairing.
UPDATE "CompanionLibrarySnapshot" snap
SET "playlists" = COALESCE(
  (SELECT jsonb_agg(jsonb_build_object(
    'id', item->>'id',
    'name', item->>'name',
    'trackCount', COALESCE((item->>'trackCount')::integer, jsonb_array_length(COALESCE(item->'tracks', '[]'::jsonb))),
    'tracks', '[]'::jsonb
  ))
  FROM jsonb_array_elements(snap."playlists") AS item),
  '[]'::jsonb
);
