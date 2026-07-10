import type { ActiveWikiView, WikiMode } from "../pages/wikiPageModel";
import type { WikiPage } from "../types";

type WikiTopbarProps = {
  activeView: ActiveWikiView;
  mode: WikiMode;
  selectedPage: WikiPage | null;
  status: string;
  syncStatus: string;
  onRefreshGraph: () => void;
  onKeepLocal: () => void;
  onUseServer: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function WikiTopbar({
  activeView,
  mode,
  selectedPage,
  status,
  syncStatus,
  onRefreshGraph,
  onKeepLocal,
  onUseServer,
  onEdit,
  onDelete
}: WikiTopbarProps) {
  const title = activeView === "canvas"
    ? "Canvas"
    : activeView === "graph"
      ? "Graph"
      : mode === "new"
        ? "New page"
        : selectedPage?.title ?? "Select a page";

  const hasConflict = activeView === "page" && selectedPage?.sync_status === "conflict";
  const canModify = activeView === "page" && selectedPage && mode === "view";
  const hasBadStatus = status.includes("failed") || status.includes("conflict");

  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <span className={`save-status ${hasBadStatus ? "bad" : ""}`}>
          {status || "idle"} / {syncStatus}
        </span>
      </div>
      <div className="topbar-actions">
        {activeView === "graph" && <button type="button" onClick={onRefreshGraph}>Refresh</button>}
        {hasConflict && <button type="button" onClick={onKeepLocal}>Keep local</button>}
        {hasConflict && <button type="button" onClick={onUseServer}>Use server</button>}
        {canModify && <button type="button" onClick={onEdit}>Edit</button>}
        {canModify && <button className="danger" type="button" onClick={onDelete}>Delete</button>}
      </div>
    </header>
  );
}
