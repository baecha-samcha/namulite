# Sync Design

MVP 2 uses client-side IndexedDB tables for `cached_pages`, `sync_queue`, and `local_settings`.

Edits are written to `cached_pages` first and mirrored into `sync_queue`. When the browser is online, `/api/sync/push` sends queued page create/update/delete operations. Successful changes are removed from the queue, conflicts mark the cached page as `conflict`, and failures keep the item with an incremented retry count.

After pushing, `/api/sync/pull?since=...` fetches changed and deleted server pages. The server uses page `version` and update `base_version` to detect conflicts.
