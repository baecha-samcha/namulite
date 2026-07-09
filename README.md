# Wikindle

Wikindle is an offline-first personal wiki PWA inspired by Obsidian-style linking and namu.wiki-style custom syntax.

## Structure

- `frontend/`: Vite + React + TypeScript client
- `backend/`: Node.js + Fastify + TypeScript API
- `database/`: MySQL schema and seed data
- `docs/`: architecture, API, security, and sync notes

## MVP 1 Scope

- Register, login, logout, and current-user API
- HttpOnly cookie sessions
- Password hashing with bcrypt-compatible hashing
- Page create/list/detail/update/delete/search
- MySQL persistence
- Basic wiki syntax rendering: headings, `[[links]]`, bold, italic, and table of contents marker
- PWA manifest and service worker shell caching
- IndexedDB `cached_pages`, `sync_queue`, and local settings storage
- Online resume sync with `/api/sync/push` and `/api/sync/pull`
- Graph view from `page_links`, including missing-link nodes
- Canvas boards with draggable page/text cards
- Sharing roles, backlinks, revisions, and missing-link panel
- Conflict resolution, page templates, and expanded wiki syntax

## Quick Start

```powershell
npm install
mysql -u root -p -e "CREATE DATABASE wikindle CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p wikindle < database/schema.sql
Copy-Item backend/.env.example backend/.env
npm run dev:backend
npm run dev:frontend
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Offline edits are saved to IndexedDB first. When the browser returns online, pending `sync_queue` items are pushed to the backend and then server changes are pulled back into the local cache.
