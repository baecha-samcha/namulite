export type Heading = {
  level: 1 | 2 | 3;
  text: string;
  id: string;
};

export type InternalLink = {
  targetTitle: string;
  linkText: string;
};

const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function extractInternalLinks(input: string): InternalLink[] {
  const links: InternalLink[] = [];
  const seen = new Set<string>();
  for (const match of input.matchAll(linkPattern)) {
    const targetTitle = match[1]?.trim();
    if (!targetTitle) continue;
    const linkText = (match[2]?.trim() || targetTitle).trim();
    const key = `${targetTitle}\u0000${linkText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ targetTitle, linkText });
  }
  return links;
}

export function extractHeadings(input: string): Heading[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.match(/^(={1,3})\s*(.+?)\s*\1$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const text = match[2].trim();
      return { level: match[1].length as 1 | 2 | 3, text, id: slugifyTitle(text) };
    });
}

export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

export function parseWikiTextToHtml(input: string): string {
  const headings = extractHeadings(input);
  const blocks: string[] = [];
  const lines = input.split(/\r?\n/);
  let inCode = false;
  let codeLines: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(`<ul>${listItems.map((item) => `<li>${processInline(item)}</li>`).join("")}</ul>`);
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === "{{{") {
      flushList();
      inCode = true;
      codeLines = [];
      continue;
    }

    if (inCode) {
      if (line.trim() === "}}}") {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCode = false;
        continue;
      }
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushList();
      blocks.push("");
      continue;
    }

    if (isTocMarker(line.trim())) {
      flushList();
      blocks.push(renderToc(headings));
      continue;
    }

    if (/^-{4,}$/.test(line.trim())) {
      flushList();
      blocks.push("<hr />");
      continue;
    }

    const list = line.match(/^\s*[-*]\s+(.+)$/);
    if (list) {
      listItems.push(list[1]);
      continue;
    }

    flushList();

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      blocks.push(`<blockquote>${processInline(quote[1])}</blockquote>`);
      continue;
    }

    const heading = line.match(/^(={1,3})\s*(.+?)\s*\1$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      blocks.push(`<h${level} id="${escapeAttribute(slugifyTitle(text))}">${processInline(text)}</h${level}>`);
      continue;
    }

    blocks.push(`<p>${processInline(line)}</p>`);
  }

  if (inCode) blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  flushList();

  return blocks.filter(Boolean).join("\n");
}

function isTocMarker(value: string) {
  return value === "[목차]" || value.toLowerCase() === "[toc]" || value === "[紐⑹감]";
}

function renderToc(headings: Heading[]): string {
  if (headings.length === 0) return `<nav class="wiki-toc"><p>No headings.</p></nav>`;
  const items = headings
    .map((heading) => `<li class="toc-level-${heading.level}"><a href="#${escapeAttribute(heading.id)}">${escapeHtml(heading.text)}</a></li>`)
    .join("");
  return `<nav class="wiki-toc"><ol>${items}</ol></nav>`;
}

function processInline(raw: string): string {
  const placeholders: string[] = [];
  const hold = (html: string) => {
    const token = `\uE000${placeholders.length}\uE000`;
    placeholders.push(html);
    return token;
  };

  let marked = raw.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, rawTarget: string, rawText?: string) => {
    const target = rawTarget.trim();
    const text = (rawText?.trim() || target).trim();
    return hold(`<a class="wiki-link" href="#" data-wiki-link="${escapeAttribute(target)}">${escapeHtml(text)}</a>`);
  });

  marked = marked.replace(/'''(.+?)'''/g, (_match, text: string) => hold(`<strong>${escapeHtml(text)}</strong>`));
  marked = marked.replace(/''(.+?)''/g, (_match, text: string) => hold(`<em>${escapeHtml(text)}</em>`));
  marked = marked.replace(/`([^`]+)`/g, (_match, text: string) => hold(`<code>${escapeHtml(text)}</code>`));

  let html = escapeHtml(marked);
  placeholders.forEach((placeholder, index) => {
    html = html.split(`\uE000${index}\uE000`).join(placeholder);
  });
  return html;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
