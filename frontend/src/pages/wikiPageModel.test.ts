import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalGraph, draftFromPage, graphPageId, pageKey, statusForPage } from "./wikiPageModel";
import type { WikiPage } from "../types";

function page(overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    id: "server-1",
    owner_id: "user-1",
    title: "Home",
    slug: "home",
    content: "[[Missing]] and [[Notes|my notes]]",
    rendered_cache: null,
    visibility: "private",
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides
  };
}

test("normalizes page identity and draft state", () => {
  const local = page({ local_id: "local-1", server_id: null, dirty: true });
  assert.equal(pageKey(local), "local-1");
  assert.equal(graphPageId(local), "local-1");
  assert.equal(statusForPage(local), "pending sync");
  assert.deepEqual(draftFromPage(local), { title: "Home", content: local.content, visibility: "private" });
});

test("builds local graph with resolved and missing links", () => {
  const notes = page({ id: "server-2", title: "Notes", slug: "notes", content: "" });
  const graph = buildLocalGraph([page(), notes]);

  assert.equal(graph.nodes.length, 3);
  assert.deepEqual(graph.edges.map(({ from, to, label }) => ({ from, to, label })), [
    { from: "server-1", to: "missing:Missing", label: "Missing" },
    { from: "server-1", to: "server-2", label: "my notes" }
  ]);
});
