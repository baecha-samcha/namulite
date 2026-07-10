import { extractInternalLinks } from "../parser/wikiParser";
import type { PageVisibility, WikiGraph, WikiPage } from "../types";

export type WikiMode = "view" | "edit" | "new";
export type ActiveWikiView = "page" | "graph" | "canvas";

export type WikiDraft = {
  title: string;
  content: string;
  visibility: PageVisibility;
};

export const pageTemplates = [
  {
    name: "Start",
    content: "= Wikindle Start =\n\n- [[Inbox]]\n- [[Projects]]\n\n[toc]\n\n== Notes ==\nWrite here."
  },
  {
    name: "Project",
    content: "= Project =\n\n== Goal ==\n\n== Links ==\n- [[Related Page]]\n\n== Tasks ==\n- Next action"
  },
  {
    name: "Daily",
    content: "= Daily Log =\n\n== Today ==\n- \n\n== Notes ==\n\n== Links ==\n- [[Inbox]]"
  }
] as const;

export const emptyDraft: WikiDraft = {
  title: "",
  content: "",
  visibility: "private"
};

export function draftFromPage(page: WikiPage): WikiDraft {
  return {
    title: page.title,
    content: page.content,
    visibility: page.visibility
  };
}

export function pageKey(page: WikiPage): string {
  return page.local_id ?? page.id;
}

export function graphPageId(page: WikiPage): string {
  return page.server_id ?? page.local_id ?? page.id;
}

export function statusForPage(page: WikiPage): string {
  if (page.sync_status === "conflict") return "conflict";
  if (page.dirty) return "pending sync";
  return "saved";
}

export function buildLocalGraph(pages: WikiPage[]): WikiGraph {
  const nodes = new Map<string, { id: string; title: string; missing: boolean }>();
  const pagesByTitle = new Map(pages.map((page) => [page.title, page]));
  const edges: WikiGraph["edges"] = [];

  for (const page of pages) {
    const id = graphPageId(page);
    nodes.set(id, { id, title: page.title, missing: false });
  }

  for (const page of pages) {
    const from = graphPageId(page);
    for (const link of extractInternalLinks(page.content)) {
      const target = pagesByTitle.get(link.targetTitle);
      const to = target ? graphPageId(target) : `missing:${link.targetTitle}`;
      if (!nodes.has(to)) {
        nodes.set(to, { id: to, title: link.targetTitle, missing: true });
      }
      edges.push({ id: `${from}:${to}:${edges.length}`, from, to, label: link.linkText });
    }
  }

  return { nodes: [...nodes.values()], edges };
}
