CREATE UNIQUE INDEX IF NOT EXISTS uq_page_revisions_page_version
  ON page_revisions (page_id, version);

CREATE INDEX IF NOT EXISTS idx_page_revisions_user
  ON page_revisions (user_id);

CREATE INDEX IF NOT EXISTS idx_permissions_user
  ON permissions (user_id);

CREATE INDEX IF NOT EXISTS idx_canvas_boards_owner_updated
  ON canvas_boards (owner_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_board_updated
  ON canvas_nodes (board_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_page
  ON canvas_nodes (page_id);
