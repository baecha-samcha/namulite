export type AuthUser = {
  id: string;
  username: string;
  email: string;
  display_name: string;
};

export type PageVisibility = "private" | "shared" | "public";

export type PageRecord = {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  content: string;
  rendered_cache: string | null;
  visibility: PageVisibility;
  version: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};