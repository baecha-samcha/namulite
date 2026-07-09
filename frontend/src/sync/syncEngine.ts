import { api } from "../api/client";
import {
  applyDeletedServerPages,
  cacheServerPages,
  getClientId,
  getLastSyncedAt,
  getSyncQueue,
  markPageConflict,
  markPageSynced,
  markQueueFailure,
  removeQueueItem,
  setLastSyncedAt
} from "../storage/offlineStore";

export async function syncNow() {
  if (!navigator.onLine) return { pushed: 0, pulled: 0, status: "offline" as const };

  const clientId = await getClientId();
  const queue = (await getSyncQueue()).map((item) => ({ ...item, client_id: clientId }));
  let pushed = 0;

  if (queue.length > 0) {
    const result = await api.pushSync({ client_id: clientId, changes: queue });
    for (const item of result.success) {
      await removeQueueItem(item.local_queue_id);
      await markPageSynced(item.entity_id, item.page, Boolean(item.deleted));
      pushed += 1;
    }
    for (const item of result.conflicts) {
      await markQueueFailure(item.local_queue_id, item.message);
      await markPageConflict(item.entity_id, `${item.message} at v${item.server_version}`);
    }
    for (const item of result.failed) {
      await markQueueFailure(item.local_queue_id, item.message);
    }
  }

  const since = await getLastSyncedAt();
  const pulled = await api.pullSync(since);
  await cacheServerPages(pulled.pages);
  await applyDeletedServerPages(pulled.deleted_pages);
  await setLastSyncedAt(pulled.server_time);

  return { pushed, pulled: pulled.pages.length + pulled.deleted_pages.length, status: "synced" as const };
}
