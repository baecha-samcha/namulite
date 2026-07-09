import test from "node:test";
import assert from "node:assert/strict";
import { extractInternalLinks, slugifyTitle } from "./wikiText.js";

test("extracts namu-style internal links", () => {
  assert.deepEqual(extractInternalLinks("[[문서명]] and [[Target|Label]]"), [
    { targetTitle: "문서명", linkText: "문서명" },
    { targetTitle: "Target", linkText: "Label" }
  ]);
});

test("slugifies unicode titles", () => {
  assert.equal(slugifyTitle("Wikindle 시작 문서!"), "wikindle-시작-문서");
});