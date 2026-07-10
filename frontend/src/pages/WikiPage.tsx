import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { CanvasView } from "../canvas/CanvasView";
import { PageDetailsPanel } from "../components/PageDetailsPanel";
import { WikiSidebar } from "../components/WikiSidebar";
import { WikiTopbar } from "../components/WikiTopbar";
import { GraphView } from "../graph/GraphView";
import { parseWikiTextToHtml } from "../parser/wikiParser";
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
import {
  buildLocalGraph,
  draftFromPage,
  emptyDraft,
  graphPageId,
  pageKey,
  pageTemplates,
  statusForPage,
  type ActiveWikiView,
  type WikiDraft,
  type WikiMode
} from "./wikiPageModel";

export function WikiPage() {
  const { user, logout } = useAuth();
  const [pages, setPages] = useState<WikiPageType[]>([]);
  const [selectedPage, setSelectedPage] = useState<WikiPageType | null>(null);
  const [draft, setDraft] = useState<WikiDraft>(emptyDraft);
  const [mode, setMode] = useState<WikiMode>("view");
  const [activeView, setActiveView] = useState<ActiveWikiView>("page");
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
    if (!selectedPage && cachedPages[0]) await selectPage(pageKey(cachedPages[0]));

    if (!navigator.onLine) {
      await updateQueueStatus();
      return;
    }

    try {
      const result = await api.listPages(q);
      await cacheServerPages(result.pages);
      const nextPages = await listCachedPages(q);
      setPages(nextPages);
      if (!selectedPage && nextPages[0]) await selectPage(pageKey(nextPages[0]));
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
        // Fall back to the local graph when the API is unreachable.
      }
    }
    setGraph(buildLocalGraph(await listCachedPages()));
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await refreshPages(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed.");
    }
  }

  async function selectPage(pageId: string) {
    setError("");
    const cached = await getCachedPage(pageId);
    if (cached) applySelectedPage(cached);

    const serverId = cached?.server_id ?? (pageId.startsWith("local-") ? null : pageId);
    if (!serverId || !navigator.onLine) return;

    try {
      const result = await api.getPage(serverId);
      const page = await cacheServerPage({ ...result.page, local_id: cached?.local_id });
      applySelectedPage(page);
    } catch (caught) {
      if (!cached) setError(caught instanceof Error ? caught.message : "Could not load page.");
    }
  }

  function applySelectedPage(page: WikiPageType) {
    setSelectedPage(page);
    setDraft(draftFromPage(page));
    setMode("view");
    setActiveView("page");
    setStatus(statusForPage(page));
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
    setDraft(draftFromPage(selectedPage));
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

      applySelectedPage(page);
      setStatus("saved locally");
      await runSync();

      const syncedPage = await getCachedPage(pageKey(page));
      if (syncedPage) applySelectedPage(syncedPage);

      await refreshPages(query);
      await loadGraph();
    } catch (caught) {
      setStatus("save failed");
      setError(caught instanceof Error ? caught.message : "Save failed.");
    }
  }

  async function removePage() {
    if (!selectedPage || !window.confirm(`Delete '${selectedPage.title}'?`)) return;
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
      if (result[0]) await selectPage(pageKey(result[0]));
      await loadGraph();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed.");
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
      await selectPage(pageKey(localMatch));
      return;
    }

    try {
      const result = await api.getPageByTitle(title);
      const page = await cacheServerPage(result.page);
      await selectPage(pageKey(page));
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

  function changeView(view: ActiveWikiView) {
    if (view === "graph") {
      void openGraph();
      return;
    }
    setActiveView(view);
  }

  async function openGraph() {
    setMode("view");
    setActiveView("graph");
    await loadGraph();
  }

  async function keepLocalConflict() {
    if (!selectedPage) return;
    const pageId = selectedPage.server_id ?? selectedPage.id;
    try {
      const result = await api.getPage(pageId);
      await prepareConflictRetry(pageId, result.page.version);
      await runSync();
      const resolved = await getCachedPage(pageKey(selectedPage));
      if (resolved) applySelectedPage(resolved);
      await refreshPages(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Conflict retry failed.");
    }
  }

  async function useServerConflict() {
    if (!selectedPage) return;
    const pageId = selectedPage.server_id ?? selectedPage.id;
    try {
      const result = await api.getPage(pageId);
      const resolved = await replaceCachedPageWithServer(pageKey(selectedPage), result.page);
      applySelectedPage(resolved);
      await refreshPages(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Server restore failed.");
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
    if (!navigator.onLine) {
      setSyncStatus(queue.length > 0 ? `offline, pending ${queue.length}` : "offline");
      return;
    }
    setSyncStatus(prefix ?? (queue.length > 0 ? `pending sync ${queue.length}` : "synced"));
  }

  return (
    <main className="app-shell">
      <WikiSidebar
        displayName={user?.display_name}
        activeView={activeView}
        pages={pages}
        selectedPage={selectedPage}
        query={query}
        onQueryChange={setQuery}
        onSearch={search}
        onNewPage={() => startNewPage()}
        onViewChange={changeView}
        onOpenPage={(pageId) => void selectPage(pageId)}
        onLogout={logout}
      />

      <section className="workspace">
        <WikiTopbar
          activeView={activeView}
          mode={mode}
          selectedPage={selectedPage}
          status={status}
          syncStatus={syncStatus}
          onRefreshGraph={() => void loadGraph()}
          onKeepLocal={() => void keepLocalConflict()}
          onUseServer={() => void useServerConflict()}
          onEdit={startEdit}
          onDelete={() => void removePage()}
        />

        {error && <p className="app-error" role="alert">{error}</p>}
        {activeView === "page" && selectedPage?.sync_status === "conflict" && (
          <p className="conflict-banner">
            Conflict detected. Choose Keep local to overwrite the server or Use server to discard the local draft.
          </p>
        )}

        {activeView === "canvas" ? (
          <CanvasView pages={pages} selectedPage={selectedPage} onOpenPage={(pageId) => void selectPage(pageId)} />
        ) : activeView === "graph" ? (
          <GraphView
            graph={graph}
            selectedId={selectedPage ? graphPageId(selectedPage) : undefined}
            onNodeClick={(id, title, missing) => void handleGraphNodeClick(id, title, missing)}
          />
        ) : mode === "view" ? (
          <div className="page-view-grid">
            <article
              className="viewer"
              onClick={(event) => void handleRenderedClick(event)}
              dangerouslySetInnerHTML={{ __html: renderedHtml || "<p>No content.</p>" }}
            />
            <PageDetailsPanel
              page={selectedPage}
              onOpenPage={(pageId) => void selectPage(pageId)}
              onCreateMissing={(title) => startNewPage(title)}
            />
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
                  <select
                    value={draft.visibility}
                    onChange={(event) => setDraft({ ...draft, visibility: event.target.value as PageVisibility })}
                  >
                    <option value="private">private</option>
                    <option value="shared">shared</option>
                    <option value="public">public</option>
                  </select>
                </label>
              </div>
              <div className="template-bar">
                {pageTemplates.map((template) => (
                  <button key={template.name} type="button" onClick={() => applyTemplate(template.content)}>
                    {template.name}
                  </button>
                ))}
              </div>
              <textarea
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                spellCheck={false}
              />
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
