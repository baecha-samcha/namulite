import test from "node:test";
import assert from "node:assert/strict";
import { extractHeadings, extractInternalLinks, parseWikiTextToHtml } from "./wikiParser";

test("extracts internal links", () => {
  assert.deepEqual(extractInternalLinks("[[Page Name]] [[Target|Label]]"), [
    { targetTitle: "Page Name", linkText: "Page Name" },
    { targetTitle: "Target", linkText: "Label" }
  ]);
});

test("extracts headings", () => {
  assert.deepEqual(extractHeadings("= One =\n== Two =="), [
    { level: 1, text: "One", id: "one" },
    { level: 2, text: "Two", id: "two" }
  ]);
});

test("escapes html while rendering supported syntax", () => {
  const html = parseWikiTextToHtml("= Title =\n<script>x</script> '''bold'''");
  assert.match(html, /<h1/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test("renders toc lists quotes and code blocks", () => {
  const html = parseWikiTextToHtml("= Title =\n[toc]\n- item\n> quoted\n{{{\n<code>\n}}}");
  assert.match(html, /wiki-toc/);
  assert.match(html, /<ul><li>item<\/li><\/ul>/);
  assert.match(html, /<blockquote>quoted<\/blockquote>/);
  assert.match(html, /<pre><code>&lt;code&gt;<\/code><\/pre>/);
});
