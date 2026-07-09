import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { CanvasView } from "../canvas/CanvasView";
import { PageDetailsPanel } from "../components/PageDetailsPanel";
import { useAuth } from "../auth/AuthContext";
import { GraphView } from "../graph/GraphView";
import { extractInternalLinks, parseWikiTextToHtml } from "../parser/wikiParser";
import {
  cacheServerPage,
  cacheServerPages,
  createCachedPage,
  deleteCachedPage,
  getCachedPage,
  getSyncQueue,
  listCachedPages,
  prepareConflictRetry,
  replaceCachedPageWithServer,
  updateCachedPage
} from "../storage/offlineStore";
import { syncNow } from "../sync/syncEngine";
import type { PageVisibility, WikiGraph, WikiPage as WikiPageType } from "../types";

type Mode = "view" | "edit" | "new";
type ActiveView = "page" | "graph" | "canvas";

type Draft = {
  title: string;
  content: string;
  visibility: PageVisibility;
};


const pageTemplates = [
  {
    name: "Start",
    content: "= Wikindle Start =\n\n- [[Inbox]]\n- [[Projects]]\n\n[toc]\n\n== Notes ==\nWrite here."
  },
  {
    name: "Project",
    content: "= Project =\n\n== Goal ==\n\n== Links ==\n- [[Related Page]]\n\n== Tasks ==\n- Next action"
  },
  {
    name: "Daily",
    content: "= Daily Log =\n\n== Today ==\n- \n\n== Notes ==\n\n== Links ==\n- [[Inbox]]"
  }
];
const emptyDraft: Draft = {
  title: "",
  content: "",
  visibility: "private"
};

export function WikiPage() {
  const { user, logout } = useAuth();
  const [pages, setPages] = useState<WikiPageType[]>([]);
  const [selectedPage, setSelectedPage] = useState<WikiPageType | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [mode, setMode] = useState<Mode>("view");
  const [activeView, setActiveView] = useState<ActiveView>("page");
  const [graph, setGraph] = useState<WikiGraph>({ nodes: [], edges: [] });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState(navigator.onLine ? "online" : "offline");
  const [error, setError] = useState("");

  useEffect(() => {
    void refreshPages("");
    void loadGraph();
    const onOnline = () => {
      setSyncStatus("syncing");
      void runSync();
    };
    const onOffline = () => setSyncStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const renderedHtml = useMemo(
    () => parseWikiTextToHtml(mode === "view" ? selectedPage?.content ?? "" : draft.content),
    [draft.content, mode, selectedPage]
  );

  async function refreshPages(q = query) {
    const cachedPages = await listCachedPages(q);
    setPages(cachedPages);
    if (!selectedPage && cachedPages[0]) {
      await selectPage(cachedPages[0].local_id ?? cachedPages[0].id);
    }

    if (!navigator.onLine) {
      await updateQueueStatus();
      return;
    }

    try {
      const result = await api.listPages(q);
      await cacheServerPages(result.pages);
      const nextPages = await listCachedPages(q);
      setPages(nextPages);
      if (!selectedPage && nextPages[0]) await selectPage(nextPages[0].local_id ?? nextPages[0].id);
      await updateQueueStatus();
      await loadGraph();
    } catch {
      await updateQueueStatus();
    }
  }

  async function loadGraph() {
    if (navigator.onLine) {
      try {
        const result = await api.getGraph();
        setGraph(result.graph);
        return;
      } catch {
        // Fall back to local graph when the API is unreachable.
      }
    }
    setGraph(await buildLocalGraph());
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await refreshPages(query);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Search failed.");
    }
  }

  async function selectPage(pageId: string) {
    setError("");
    const cached = await getCachedPage(pageId);
    if (cached) {
      setSelectedPage(cached);
      setDraft({ title: cached.title, content: cached.content, visibility: cached.visibility });
      setMode("view");
      setActiveView("page");
      setStatus(statusForPage(cached));
    }

    const serverId = cached?.server_id ?? (pageId.startsWith("local-") ? null : pageId);
    if (serverId && navigator.onLine) {
      try {
        const result = await api.getPage(serverId);
        const page = await cacheServerPage({ ...result.page, local_id: cached?.local_id });
        setSelectedPage(page);
        setDraft({ title: page.title, content: page.content, visibility: page.visibility });
        setMode("view");
        setActiveView("page");
        setStatus(statusForPage(page));
      } catch (error) {
        if (!cached) setError(error instanceof Error ? error.message : "Could not load page.");
      }
    }
  }

  function startNewPage(title = "") {
    setSelectedPage(null);
    setDraft({ title, content: `= ${title || "New Page"} =\n\nWrite here.`, visibility: "private" });
    setMode("new");
    setActiveView("page");
    setStatus("new page");
    setError("");
  }

  function startEdit() {
    if (!selectedPage) return;
    setDraft({ title: selectedPage.title, content: selectedPage.content, visibility: selectedPage.visibility });
    setMode("edit");
    setActiveView("page");
    setStatus("editing");
  }

  function applyTemplate(content: string) {
    setDraft((current) => ({
      ...current,
      content: current.title ? content.replace(/^= .* =/, `= ${current.title} =`) : content
    }));
    setStatus("template applied");
  }
  async function savePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("saving locally");
    try {
      const page = mode === "edit" && selectedPage
        ? await updateCachedPage(selectedPage, draft)
        : await createCachedPage(draft, user!.id);
      setSelectedPage(page);
      setDraft({ title: page.title, content: page.content, visibility: page.visibility });
      setMode("view");
      setStatus("saved locally");
      await runSync();
      const syncedPage = await getCachedPage(page.local_id ?? page.id);
      if (syncedPage) {
        setSelectedPage(syncedPage);
        setDraft({ title: syncedPage.title, content: syncedPage.content, visibility: syncedPage.visibility });
        setStatus(statusForPage(syncedPage));
      }
      await refreshPages(query);
      await loadGraph();
    } catch (error) {
      setStatus("save failed");
      setError(error instanceof Error ? error.message : "Save failed.");
    }
  }

  async function removePage() {
    if (!selectedPage) return;
    if (!window.confirm(`Delete '${selectedPage.title}'?`)) return;
    setError("");
    try {
      await deleteCachedPage(selectedPage);
      setSelectedPage(null);
      setDraft(emptyDraft);
      setMode("view");
      setStatus("deleted locally");
      await runSync();
      const result = await listCachedPages(query);
      setPages(result);
      if (result[0]) await selectPage(result[0].local_id ?? result[0].id);
      await loadGraph();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  async function handleRenderedClick(event: MouseEvent<HTMLElement>) {
    const target = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-wiki-link]");
    if (!target) return;
    event.preventDefault();
    const title = target.dataset.wikiLink;
    if (!title) return;

    const localMatch = (await listCachedPages()).find((page) => page.title === title);
    if (localMatch) {
      await selectPage(localMatch.local_id ?? localMatch.id);
      return;
    }

    try {
      const result = await api.getPageByTitle(title);
      const page = await cacheServerPage(result.page);
      await selectPage(page.local_id ?? page.id);
    } catch {
      startNewPage(title);
      setStatus("missing link");
    }
  }

  async function handleGraphNodeClick(nodeId: string, title: string, missing: boolean) {
    if (missing || nodeId.startsWith("missing:")) {
      startNewPage(title);
      setStatus("missing graph node");
      return;
    }
    await selectPage(nodeId);
  }

  async function openGraph() {
    setMode("view");
    setActiveView("graph");
    await loadGraph();
  }

  async function keepLocalConflict() {
    if (!selectedPage?.server_id && !selectedPage?.id) return;
    const pageId = selectedPage.server_id ?? selectedPage.id;
    try {
      const result = await api.getPage(pageId);
      await prepareConflictRetry(pageId, result.page.version);
      await runSync();
      const resolved = await getCachedPage(selectedPage.local_id ?? pageId);
      if (resolved) {
        setSelectedPage(resolved);
        setDraft({ title: resolved.title, content: resolved.content, visibility: resolved.visibility });
        setStatus(statusForPage(resolved));
      }
      await refreshPages(query);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Conflict retry failed.");
    }
  }

  async function useServerConflict() {
    if (!selectedPage?.server_id && !selectedPage?.id) return;
    const pageId = selectedPage.server_id ?? selectedPage.id;
    try {
      const result = await api.getPage(pageId);
      const resolved = await replaceCachedPageWithServer(selectedPage.local_id ?? pageId, result.page);
      setSelectedPage(resolved);
      setDraft({ title: resolved.title, content: resolved.content, visibility: resolved.visibility });
      setStatus(statusForPage(resolved));
      await refreshPages(query);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Server restore failed.");
    }
  }
  async function runSync() {
    if (!navigator.onLine) {
      await updateQueueStatus();
      return;
    }
    try {
      setSyncStatus("syncing");
      const result = await syncNow();
      setSyncStatus(result.status === "synced" ? "synced" : "offline");
    } catch {
      await updateQueueStatus("sync failed");
    }
  }

  async function updateQueueStatus(prefix?: string) {
    const queue = await getSyncQueue();
    if (!navigator.onLine) setSyncStatus(queue.length > 0 ? `offline, pending ${queue.length}` : "offline");
    else setSyncStatus(prefix ?? (queue.length > 0 ? `pending sync ${queue.length}` : "synced"));
  }

  async function buildLocalGraph(): Promise<WikiGraph> {
    const localPages = await listCachedPages();
    const nodes = new Map<string, { id: string; title: string; missing: boolean }>();
    const byTitle = new Map(localPages.map((page) => [page.title, page]));
    const edges: WikiGraph["edges"] = [];

    for (const page of localPages) {
      const pageId = page.server_id ?? page.local_id ?? page.id;
      nodes.set(pageId, { id: pageId, title: page.title, missing: false });
    }

    for (const page of localPages) {
      const from = page.server_id ?? page.local_id ?? page.id;
      for (const link of extractInternalLinks(page.content)) {
        const target = byTitle.get(link.targetTitle);
        const to = target ? target.server_id ?? target.local_id ?? target.id : `missing:${link.targetTitle}`;
        if (!nodes.has(to)) nodes.set(to, { id: to, title: link.targetTitle, missing: true });
        edges.push({ id: `${from}:${to}:${edges.length}`, from, to, label: link.linkText });
      }
    }

    return { nodes: [...nodes.values()], edges };
  }

  function statusForPage(page: WikiPageType) {
    if (page.sync_status === "conflict") return "conflict";
    if (page.dirty) return "pending sync";
    return "saved";
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <strong>Wikindle</strong>
            <span>{user?.display_name}</span>
          </div>
          <button className="icon-button" type="button" onClick={logout} title="Logout">X</button>
        </div>

        <button className="primary-button full-width" type="button" onClick={() => startNewPage()}>New page</button>
        <div className="view-switcher">
          <button className={activeView === "page" ? "active" : ""} type="button" onClick={() => setActiveView("page")}>Page</button>
          <button className={activeView === "graph" ? "active" : ""} type="button" onClick={() => void openGraph()}>Graph</button>
          <button className={activeView === "canvas" ? "active" : ""} type="button" onClick={() => setActiveView("canvas")}>Canvas</button>
        </div>

        <form className="search-form" onSubmit={search}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages" />
          <button type="submit">Search</button>
        </form>

        <nav className="page-list" aria-label="Page list">
          {pages.map((page) => (
            <button
              key={page.local_id ?? page.id}
              className={(selectedPage?.local_id ?? selectedPage?.id) === (page.local_id ?? page.id) ? "active" : ""}
              type="button"
              onClick={() => void selectPage(page.local_id ?? page.id)}
            >
              <span>{page.title}</span>
              <small>{page.dirty ? "local" : `v${page.version}`}</small>
            </button>
          ))}
          {pages.length === 0 && <p className="empty-state">No pages yet.</p>}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{activeView === "canvas" ? "Canvas" : activeView === "graph" ? "Graph" : mode === "new" ? "New page" : selectedPage?.title ?? "Select a page"}</h1>
            <span className={`save-status ${status.includes("failed") || status.includes("conflict") ? "bad" : ""}`}>{status || "idle"} / {syncStatus}</span>
          </div>
          <div className="topbar-actions">
            {activeView === "graph" && <button type="button" onClick={() => void loadGraph()}>Refresh</button>}
            {activeView === "page" && selectedPage?.sync_status === "conflict" && <button type="button" onClick={() => void keepLocalConflict()}>Keep local</button>}
            {activeView === "page" && selectedPage?.sync_status === "conflict" && <button type="button" onClick={() => void useServerConflict()}>Use server</button>}
            {activeView === "page" && selectedPage && mode === "view" && <button type="button" onClick={startEdit}>Edit</button>}
            {activeView === "page" && selectedPage && mode === "view" && <button className="danger" type="button" onClick={() => void removePage()}>Delete</button>}
          </div>
        </header>

        {error && <p className="app-error" role="alert">{error}</p>}
        {activeView === "page" && selectedPage?.sync_status === "conflict" && <p className="conflict-banner">Conflict detected. Choose Keep local to overwrite the server or Use server to discard the local draft.</p>}

        {activeView === "canvas" ? (
          <CanvasView pages={pages} selectedPage={selectedPage} onOpenPage={(pageId) => void selectPage(pageId)} />
        ) : activeView === "graph" ? (
          <GraphView graph={graph} selectedId={selectedPage?.server_id ?? selectedPage?.local_id ?? selectedPage?.id} onNodeClick={(id, title, missing) => void handleGraphNodeClick(id, title, missing)} />
        ) : mode === "view" ? (
          <div className="page-view-grid">
            <article className="viewer" onClick={(event) => void handleRenderedClick(event)} dangerouslySetInnerHTML={{ __html: renderedHtml || "<p>No content.</p>" }} />
            <PageDetailsPanel page={selectedPage} onOpenPage={(pageId) => void selectPage(pageId)} onCreateMissing={(title) => startNewPage(title)} />
          </div>
        ) : (
          <form className="editor-layout" onSubmit={savePage}>
            <section className="editor-pane">
              <div className="field-row">
                <label>
                  Title
                  <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
                </label>
                <label>
                  Visibility
                  <select value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value as PageVisibility })}>
                    <option value="private">private</option>
                    <option value="shared">shared</option>
                    <option value="public">public</option>
                  </select>
                </label>
              </div>
              <div className="template-bar">
                {pageTemplates.map((template) => (
                  <button key={template.name} type="button" onClick={() => applyTemplate(template.content)}>{template.name}</button>
                ))}
              </div>
              <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} spellCheck={false} />
              <div className="editor-actions">
                <button className="primary-button" type="submit">Save</button>
                <button type="button" onClick={() => selectedPage ? setMode("view") : startNewPage()}>Cancel</button>
              </div>
            </section>
            <section className="preview-pane" onClick={(event) => void handleRenderedClick(event)}>
              <h2>Preview</h2>
              <div className="viewer compact" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            </section>
          </form>
        )}
      </section>
    </main>
  );
}
