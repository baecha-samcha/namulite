export type User = {
  id: string;
  username: string;
  email: string;
  display_name: string;
};

export type PageVisibility = "private" | "shared" | "public";

export type WikiPage = {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  content: string;
  rendered_cache: string | null;
  visibility: PageVisibility;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  local_id?: string;
  server_id?: string | null;
  dirty?: boolean;
  sync_status?: "synced" | "pending" | "failed" | "conflict";
  last_error?: string | null;
};

export type ApiError = {
  code: string;
  message: string;
};

export type ApiResponse<T> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: ApiError };

export type SyncQueueItem = {
  id: string;
  client_id: string;
  entity_type: "page";
  entity_id: string;
  operation: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  base_version?: number;
  created_at: string;
  retry_count: number;
  last_error: string | null;
};

export type WikiGraphNode = {
  id: string;
  title: string;
  missing: boolean;
};

export type WikiGraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
};

export type WikiGraph = {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
};
export type CanvasBoard = {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CanvasNode = {
  id: string;
  board_id: string;
  page_id: string | null;
  type: "page" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string | null;
  title?: string | null;
  created_at: string;
  updated_at: string;
};

export type PagePermission = {
  id: string;
  page_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  username: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type PageRevision = {
  id: string;
  page_id: string;
  user_id: string;
  content: string;
  summary: string | null;
  version: number;
  created_at: string;
  username: string;
  display_name: string;
};

export type PageBacklink = {
  page_id: string;
  title: string;
  link_text: string;
  created_at: string;
};

export type MissingLink = {
  target_title: string;
  references_count: number;
};