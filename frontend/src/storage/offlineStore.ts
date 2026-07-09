import type { PageVisibility, SyncQueueItem, WikiPage } from "../types";

export type CachedPage = WikiPage & {
  local_id: string;
  server_id: string | null;
  dirty: boolean;
  deleted: boolean;
  sync_status: "synced" | "pending" | "failed" | "conflict";
  last_error: string | null;
  last_synced_at: string | null;
};

type LocalSetting = {
  key: string;
  value: string;
  updated_at: string;
};

const dbName = "wikindle";
const dbVersion = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("cached_pages")) {
          const pages = db.createObjectStore("cached_pages", { keyPath: "local_id" });
          pages.createIndex("server_id", "server_id", { unique: false });
          pages.createIndex("updated_at", "updated_at", { unique: false });
        }
        if (!db.objectStoreNames.contains("sync_queue")) {
          const queue = db.createObjectStore("sync_queue", { keyPath: "id" });
          queue.createIndex("created_at", "created_at", { unique: false });
        }
        if (!db.objectStoreNames.contains("local_settings")) {
          db.createObjectStore("local_settings", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function objectStore(name: string, mode: IDBTransactionMode) {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

async function getAll<T>(name: string) {
  return promisify<T[]>((await objectStore(name, "readonly")).getAll());
}

async function put<T>(name: string, value: T) {
  await promisify((await objectStore(name, "readwrite")).put(value));
}

async function remove(name: string, key: IDBValidKey) {
  await promisify((await objectStore(name, "readwrite")).delete(key));
}

function now() {
  return new Date().toISOString();
}

function makeLocalId() {
  return `local-${crypto.randomUUID()}`;
}

function toViewPage(page: CachedPage): WikiPage {
  return {
    ...page,
    id: page.server_id ?? page.local_id,
    local_id: page.local_id,
    server_id: page.server_id
  };
}

function makeQueueItem(operation: SyncQueueItem["operation"], entityId: string, payload: Record<string, unknown>, baseVersion?: number): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    client_id: "",
    entity_type: "page",
    entity_id: entityId,
    operation,
    payload,
    base_version: baseVersion,
    created_at: now(),
    retry_count: 0,
    last_error: null
  };
}

export async function getClientId() {
  const settings = await objectStore("local_settings", "readwrite");
  const existing = await promisify<LocalSetting | undefined>(settings.get("client_id"));
  if (existing?.value) return existing.value;
  const value = crypto.randomUUID();
  await promisify(settings.put({ key: "client_id", value, updated_at: now() }));
  return value;
}

export async function getLastSyncedAt() {
  const existing = await promisify<LocalSetting | undefined>((await objectStore("local_settings", "readonly")).get("last_synced_at"));
  return existing?.value;
}

export async function setLastSyncedAt(value: string) {
  await put<LocalSetting>("local_settings", { key: "last_synced_at", value, updated_at: now() });
}

export async function listCachedPages(q = "") {
  const pages = await getAll<CachedPage>("cached_pages");
  const query = q.trim().toLowerCase();
  return pages
    .filter((page) => !page.deleted)
    .filter((page) => !query || page.title.toLowerCase().includes(query) || page.content.toLowerCase().includes(query))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(toViewPage);
}

export async function getCachedPage(id: string) {
  const page = await getRawCachedPage(id);
  return page && !page.deleted ? toViewPage(page) : null;
}

export async function cacheServerPages(pages: WikiPage[]) {
  for (const page of pages) {
    await cacheServerPage(page);
  }
}

export async function cacheServerPage(page: WikiPage) {
  const pages = await getAll<CachedPage>("cached_pages");
  const existing = pages.find((candidate) => candidate.server_id === page.id || candidate.local_id === page.local_id);
  if (existing?.dirty && existing.sync_status !== "synced") return toViewPage(existing);

  const cached: CachedPage = {
    ...page,
    id: page.id,
    local_id: existing?.local_id ?? page.local_id ?? page.id,
    server_id: page.id,
    dirty: false,
    deleted: false,
    sync_status: "synced",
    last_error: null,
    last_synced_at: now()
  };
  await put("cached_pages", cached);
  return toViewPage(cached);
}

export async function createCachedPage(input: { title: string; content: string; visibility: PageVisibility }, ownerId: string) {
  const timestamp = now();
  const id = makeLocalId();
  const cached: CachedPage = {
    id,
    local_id: id,
    server_id: null,
    owner_id: ownerId,
    title: input.title,
    slug: input.title.trim().toLowerCase().replace(/\s+/g, "-") || "page",
    content: input.content,
    rendered_cache: null,
    visibility: input.visibility,
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    dirty: true,
    deleted: false,
    sync_status: "pending",
    last_error: null,
    last_synced_at: null
  };
  await put("cached_pages", cached);
  await enqueuePageChange(makeQueueItem("create", id, input));
  return toViewPage(cached);
}

export async function updateCachedPage(page: WikiPage, input: { title: string; content: string; visibility: PageVisibility }) {
  const cached = await getRawCachedPage(page.local_id ?? page.id);
  if (!cached) throw new Error("Local page not found");
  const updated: CachedPage = {
    ...cached,
    ...input,
    dirty: true,
    sync_status: "pending",
    last_error: null,
    updated_at: now()
  };
  await put("cached_pages", updated);
  await enqueuePageChange(makeQueueItem("update", updated.server_id ?? updated.local_id, input, updated.server_id ? updated.version : undefined));
  return toViewPage(updated);
}

export async function deleteCachedPage(page: WikiPage) {
  const cached = await getRawCachedPage(page.local_id ?? page.id);
  if (!cached) return;
  const queue = await getSyncQueue();
  const createItem = queue.find((item) => item.entity_id === cached.local_id && item.operation === "create");
  if (!cached.server_id && createItem) {
    await remove("sync_queue", createItem.id);
    await remove("cached_pages", cached.local_id);
    return;
  }
  await put("cached_pages", { ...cached, deleted: true, dirty: true, sync_status: "pending", updated_at: now(), deleted_at: now() });
  await enqueuePageChange(makeQueueItem("delete", cached.server_id ?? cached.local_id, {}, cached.server_id ? cached.version : undefined));
}

export async function getSyncQueue() {
  return (await getAll<SyncQueueItem>("sync_queue")).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function removeQueueItem(id: string) {
  await remove("sync_queue", id);
}

export async function markQueueFailure(id: string, message: string) {
  const queue = await getSyncQueue();
  const item = queue.find((candidate) => candidate.id === id);
  if (item) await put("sync_queue", { ...item, retry_count: item.retry_count + 1, last_error: message });
}

export async function markPageSynced(entityId: string, page?: WikiPage, deleted = false) {
  const cached = await getRawCachedPage(entityId);
  if (deleted) {
    if (cached) await remove("cached_pages", cached.local_id);
    return;
  }
  if (page) {
    const existing = cached ? { ...page, local_id: cached.local_id } : page;
    await cacheServerPage(existing);
  }
}

export async function markPageConflict(entityId: string, message: string) {
  const cached = await getRawCachedPage(entityId);
  if (cached) await put("cached_pages", { ...cached, sync_status: "conflict", last_error: message, dirty: true });
}


export async function prepareConflictRetry(entityId: string, serverVersion: number) {
  const queue = await getSyncQueue();
  for (const item of queue.filter((candidate) => candidate.entity_id === entityId)) {
    await put("sync_queue", { ...item, base_version: serverVersion, retry_count: 0, last_error: null });
  }
  const cached = await getRawCachedPage(entityId);
  if (cached) await put("cached_pages", { ...cached, sync_status: "pending", dirty: true, last_error: null });
}

export async function replaceCachedPageWithServer(entityId: string, page: WikiPage) {
  const cached = await getRawCachedPage(entityId);
  const queue = await getSyncQueue();
  for (const item of queue.filter((candidate) => candidate.entity_id === entityId || candidate.entity_id === page.id)) {
    await remove("sync_queue", item.id);
  }
  const next: CachedPage = {
    ...page,
    id: page.id,
    local_id: cached?.local_id ?? page.local_id ?? page.id,
    server_id: page.id,
    dirty: false,
    deleted: false,
    sync_status: "synced",
    last_error: null,
    last_synced_at: now()
  };
  await put("cached_pages", next);
  return toViewPage(next);
}
export async function applyDeletedServerPages(pages: Array<{ id: string }>) {
  const cached = await getAll<CachedPage>("cached_pages");
  for (const deleted of pages) {
    const page = cached.find((candidate) => candidate.server_id === deleted.id);
    if (page && !page.dirty) await remove("cached_pages", page.local_id);
  }
}

async function getRawCachedPage(id: string) {
  const pages = await getAll<CachedPage>("cached_pages");
  return pages.find((candidate) => candidate.local_id === id || candidate.server_id === id || candidate.id === id) ?? null;
}

async function enqueuePageChange(item: SyncQueueItem) {
  const queue = await getSyncQueue();
  const existingCreate = queue.find((candidate) => candidate.entity_id === item.entity_id && candidate.operation === "create");
  if (existingCreate && item.operation === "update") {
    await put("sync_queue", { ...existingCreate, payload: item.payload, created_at: existingCreate.created_at });
    return;
  }
  await put("sync_queue", item);
}
