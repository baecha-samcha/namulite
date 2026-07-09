# MVP Plan

## MVP 1: Basic Wiki

- Register, login, logout, current-user API
- Document create/list/detail/update/delete/search
- Basic namu.wiki-style syntax renderer
- Internal link extraction and `page_links` persistence
- MySQL persistence with version fields for conflict detection

## MVP 2: Offline PWA

- PWA manifest and service worker
- App shell caching
- IndexedDB stores for cached pages and `sync_queue`
- Online return detection and push/pull sync API

## MVP 3: Graph View

- Extract links from page content into `page_links`
- Return graph nodes and edges through the backend API
- Render a lightweight SVG graph in the client
- Show missing-link nodes and let users start those pages

## MVP 4: Canvas

- Create and list canvas boards
- Add page and text nodes
- Drag nodes and persist positions
- Open linked pages from canvas nodes

## MVP 5: Sharing and Permissions

- Share pages with users as viewer or editor
- Store permissions in MySQL
- Allow shared/public page reads through the normal page API
- Allow editor updates while owner-only delete remains enforced

## MVP 6: Advanced Basics

- Revision list from `page_revisions`
- Backlinks from `page_links`
- Missing-link list
- Document detail panel with share, history, backlinks, and missing links
- Conflict resolution controls for keep-local and use-server flows
- Built-in page templates
- Extended wiki parser for `[toc]`, lists, quotes, horizontal rules, inline code, and code blocks

Still excluded: real-time editing, CRDT, image upload, notifications, admin dashboard, and complete namu.wiki syntax parity.
