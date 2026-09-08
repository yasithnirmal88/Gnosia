// Shared tuning knobs for the group-room load profiles.
export const option = {
  groupSize: __ENV.GROUP_SIZE ? Number(__ENV.GROUP_SIZE) : 15, // mirrors maxPlayers=15
  blobSize: __ENV.BLOB_SIZE ? Number(__ENV.BLOB_SIZE) : 200,
  blob: 'x'.repeat(__ENV.BLOB_SIZE ? Number(__ENV.BLOB_SIZE) : 200),
}