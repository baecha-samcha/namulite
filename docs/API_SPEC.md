# API Spec

All responses use `{ "ok": true, "data": {}, "error": null }`.

Errors use `{ "ok": false, "data": null, "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }`.

## Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Pages

- `GET /api/pages?q=&limit=&offset=`
- `POST /api/pages`
- `GET /api/pages/:id`
- `GET /api/pages/by-title/:title`
- `PATCH /api/pages/:id`
- `DELETE /api/pages/:id`

## Graph And Links

- `GET /api/pages/graph`
- `GET /api/pages/:id/backlinks`
- `GET /api/links/missing`

## Revisions

- `GET /api/pages/:id/revisions`

## Sharing

- `GET /api/pages/:id/permissions`
- `POST /api/pages/:id/share`
- `DELETE /api/pages/:id/permissions/:userId`

## Canvas

- `GET /api/canvas/boards`
- `POST /api/canvas/boards`
- `GET /api/canvas/boards/:id`
- `PATCH /api/canvas/boards/:id`
- `DELETE /api/canvas/boards/:id`
- `POST /api/canvas/boards/:id/nodes`
- `PATCH /api/canvas/nodes/:id`
- `DELETE /api/canvas/nodes/:id`

## Sync

- `POST /api/sync/push`
- `GET /api/sync/pull?since=`
