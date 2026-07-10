import type { FormEvent } from "react";
import type { WikiPage } from "../types";
import type { ActiveWikiView } from "../pages/wikiPageModel";
import { pageKey } from "../pages/wikiPageModel";

type WikiSidebarProps = {
  displayName?: string;
  activeView: ActiveWikiView;
  pages: WikiPage[];
  selectedPage: WikiPage | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onNewPage: () => void;
  onViewChange: (view: ActiveWikiView) => void;
  onOpenPage: (pageId: string) => void;
  onLogout: () => void;
};

export function WikiSidebar({
  displayName,
  activeView,
  pages,
  selectedPage,
  query,
  onQueryChange,
  onSearch,
  onNewPage,
  onViewChange,
  onOpenPage,
  onLogout
}: WikiSidebarProps) {
  const selectedPageKey = selectedPage ? pageKey(selectedPage) : null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <strong>Wikindle</strong>
          <span>{displayName}</span>
        </div>
        <button className="icon-button" type="button" onClick={onLogout} title="Logout">X</button>
      </div>

      <button className="primary-button full-width" type="button" onClick={onNewPage}>New page</button>
      <div className="view-switcher">
        <button className={activeView === "page" ? "active" : ""} type="button" onClick={() => onViewChange("page")}>Page</button>
        <button className={activeView === "graph" ? "active" : ""} type="button" onClick={() => onViewChange("graph")}>Graph</button>
        <button className={activeView === "canvas" ? "active" : ""} type="button" onClick={() => onViewChange("canvas")}>Canvas</button>
      </div>

      <form className="search-form" onSubmit={onSearch}>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search pages" />
        <button type="submit">Search</button>
      </form>

      <nav className="page-list" aria-label="Page list">
        {pages.map((page) => {
          const key = pageKey(page);
          return (
            <button
              key={key}
              className={selectedPageKey === key ? "active" : ""}
              type="button"
              onClick={() => onOpenPage(key)}
            >
              <span>{page.title}</span>
              <small>{page.dirty ? "local" : `v${page.version}`}</small>
            </button>
          );
        })}
        {pages.length === 0 && <p className="empty-state">No pages yet.</p>}
      </nav>
    </aside>
  );
}
