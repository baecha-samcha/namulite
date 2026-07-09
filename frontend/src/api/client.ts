import type { ApiResponse, CanvasBoard, CanvasNode, MissingLink, PageBacklink, PagePermission, PageRevision, PageVisibility, SyncQueueItem, User, WikiGraph, WikiPage } from "../types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.ok) {
    throw new Error(payload.error.message || payload.error.code);
  }
  return payload.data;
}

export const api = {
  register(input: { username: string; email: string; password: string; display_name: string }) {
    return request<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
  },
  login(input: { username_or_email: string; password: string }) {
    return request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
  },
  logout() {
    return request<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" });
  },
  me() {
    return request<{ user: User }>("/api/auth/me");
  },
  listPages(q = "") {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    return request<{ pages: WikiPage[] }>(`/api/pages?${params.toString()}`);
  },
  createPage(input: { title: string; content: string; visibility: PageVisibility }) {
    return request<{ page: WikiPage }>("/api/pages", { method: "POST", body: JSON.stringify(input) });
  },
  getPage(id: string) {
    return request<{ page: WikiPage }>(`/api/pages/${id}`);
  },
  getPageByTitle(title: string) {
    return request<{ page: WikiPage }>(`/api/pages/by-title/${encodeURIComponent(title)}`);
  },
  updatePage(id: string, input: { title: string; content: string; visibility: PageVisibility; base_version: number }) {
    return request<{ page: WikiPage }>(`/api/pages/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  deletePage(id: string) {
    return request<{ deleted: boolean }>(`/api/pages/${id}`, { method: "DELETE" });
  },
  getGraph() {
    return request<{ graph: WikiGraph }>("/api/pages/graph");
  },
  listBoards() {
    return request<{ boards: CanvasBoard[] }>("/api/canvas/boards");
  },
  createBoard(input: { title: string }) {
    return request<{ board: CanvasBoard }>("/api/canvas/boards", { method: "POST", body: JSON.stringify(input) });
  },
  getBoard(id: string) {
    return request<{ board: CanvasBoard; nodes: CanvasNode[] }>(`/api/canvas/boards/${id}`);
  },
  updateBoard(id: string, input: { title: string }) {
    return request<{ board: CanvasBoard }>(`/api/canvas/boards/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  deleteBoard(id: string) {
    return request<{ deleted: boolean }>(`/api/canvas/boards/${id}`, { method: "DELETE" });
  },
  createCanvasNode(boardId: string, input: { page_id?: string | null; type: "page" | "text"; x?: number; y?: number; width?: number; height?: number; content?: string | null }) {
    return request<{ node: CanvasNode }>(`/api/canvas/boards/${boardId}/nodes`, { method: "POST", body: JSON.stringify(input) });
  },
  updateCanvasNode(id: string, input: Partial<{ page_id: string | null; type: "page" | "text"; x: number; y: number; width: number; height: number; content: string | null }>) {
    return request<{ node: CanvasNode }>(`/api/canvas/nodes/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  deleteCanvasNode(id: string) {
    return request<{ deleted: boolean }>(`/api/canvas/nodes/${id}`, { method: "DELETE" });
  },
  listPermissions(pageId: string) {
    return request<{ permissions: PagePermission[] }>(`/api/pages/${pageId}/permissions`);
  },
  sharePage(pageId: string, input: { username_or_email: string; role: "editor" | "viewer" }) {
    return request<{ permissions: PagePermission[] }>(`/api/pages/${pageId}/share`, { method: "POST", body: JSON.stringify(input) });
  },
  removePermission(pageId: string, userId: string) {
    return request<{ deleted: boolean }>(`/api/pages/${pageId}/permissions/${userId}`, { method: "DELETE" });
  },
  listRevisions(pageId: string) {
    return request<{ revisions: PageRevision[] }>(`/api/pages/${pageId}/revisions`);
  },
  listBacklinks(pageId: string) {
    return request<{ backlinks: PageBacklink[] }>(`/api/pages/${pageId}/backlinks`);
  },
  listMissingLinks() {
    return request<{ missing_links: MissingLink[] }>("/api/links/missing");
  },  pushSync(input: { client_id: string; changes: SyncQueueItem[] }) {
    return request<{
      success: Array<{ local_queue_id: string; entity_id: string; server_id?: string; deleted?: boolean; page?: WikiPage }>;
      conflicts: Array<{ local_queue_id: string; entity_id: string; server_version: number; message: string; page?: WikiPage | null }>;
      failed: Array<{ local_queue_id: string; entity_id: string; message: string }>;
      server_time: string;
    }>("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        client_id: input.client_id,
        changes: input.changes.map((change) => ({
          local_queue_id: change.id,
          entity_type: change.entity_type,
          entity_id: change.entity_id,
          operation: change.operation,
          payload: change.payload,
          base_version: change.base_version,
          created_at: change.created_at
        }))
      })
    });
  },
  pullSync(since?: string) {
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    return request<{ pages: WikiPage[]; deleted_pages: Array<{ id: string; updated_at: string; deleted_at: string }>; server_time: string }>(
      `/api/sync/pull?${params.toString()}`
    );
  }
};
