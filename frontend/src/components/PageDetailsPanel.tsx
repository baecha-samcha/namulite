import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { MissingLink, PageBacklink, PagePermission, PageRevision, WikiPage } from "../types";

type PageDetailsPanelProps = {
  page: WikiPage | null;
  onOpenPage: (pageId: string) => void;
  onCreateMissing: (title: string) => void;
};

export function PageDetailsPanel({ page, onOpenPage, onCreateMissing }: PageDetailsPanelProps) {
  const [permissions, setPermissions] = useState<PagePermission[]>([]);
  const [revisions, setRevisions] = useState<PageRevision[]>([]);
  const [backlinks, setBacklinks] = useState<PageBacklink[]>([]);
  const [missingLinks, setMissingLinks] = useState<MissingLink[]>([]);
  const [shareTarget, setShareTarget] = useState("");
  const [shareRole, setShareRole] = useState<"editor" | "viewer">("viewer");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadDetails();
  }, [page?.id]);

  async function loadDetails() {
    setError("");
    try {
      const missing = await api.listMissingLinks();
      setMissingLinks(missing.missing_links);
      if (!page || page.dirty || !page.server_id && page.id.startsWith("local-")) {
        setPermissions([]);
        setRevisions([]);
        setBacklinks([]);
        return;
      }
      const pageId = page.server_id ?? page.id;
      const [permissionResult, revisionResult, backlinkResult] = await Promise.all([
        api.listPermissions(pageId),
        api.listRevisions(pageId),
        api.listBacklinks(pageId)
      ]);
      setPermissions(permissionResult.permissions);
      setRevisions(revisionResult.revisions);
      setBacklinks(backlinkResult.backlinks);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load details.");
    }
  }

  async function share(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!page || !shareTarget.trim()) return;
    try {
      const pageId = page.server_id ?? page.id;
      const result = await api.sharePage(pageId, { username_or_email: shareTarget.trim(), role: shareRole });
      setPermissions(result.permissions);
      setShareTarget("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Share failed.");
    }
  }

  return (
    <aside className="detail-panel">
      <section>
        <h2>Backlinks</h2>
        {backlinks.map((link) => (
          <button key={`${link.page_id}-${link.link_text}`} type="button" onClick={() => onOpenPage(link.page_id)}>{link.title}</button>
        ))}
        {backlinks.length === 0 && <p>No backlinks.</p>}
      </section>

      <section>
        <h2>Share</h2>
        <form className="share-form" onSubmit={share}>
          <input value={shareTarget} onChange={(event) => setShareTarget(event.target.value)} placeholder="username or email" />
          <select value={shareRole} onChange={(event) => setShareRole(event.target.value as "editor" | "viewer")}>
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
          </select>
          <button type="submit" disabled={!page || Boolean(page.dirty)}>Share</button>
        </form>
        {permissions.map((permission) => (
          <p key={permission.id}>{permission.username} / {permission.role}</p>
        ))}
      </section>

      <section>
        <h2>History</h2>
        {revisions.slice(0, 6).map((revision) => (
          <p key={revision.id}>v{revision.version} by {revision.display_name}</p>
        ))}
        {revisions.length === 0 && <p>No revisions.</p>}
      </section>

      <section>
        <h2>Missing links</h2>
        {missingLinks.slice(0, 8).map((link) => (
          <button key={link.target_title} type="button" onClick={() => onCreateMissing(link.target_title)}>{link.target_title} ({link.references_count})</button>
        ))}
        {missingLinks.length === 0 && <p>No missing links.</p>}
      </section>

      {error && <p className="form-error">{error}</p>}
    </aside>
  );
}
