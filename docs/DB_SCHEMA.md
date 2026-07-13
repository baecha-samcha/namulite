# Database Schema

The canonical MariaDB schema is the ordered migration set in `database/migrations/`.

Applied filenames and SHA-256 checksums are recorded in `schema_migrations`.

Important MVP 1 tables: `users`, `sessions`, `pages`, `page_revisions`, and `page_links`.

Collaboration and sync tables: `permissions`, `canvas_boards`, `canvas_nodes`, and `sync_log`.
