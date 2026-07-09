export type InternalLink = {
  targetTitle: string;
  linkText: string;
};

const internalLinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function extractInternalLinks(input: string): InternalLink[] {
  const links: InternalLink[] = [];
  const seen = new Set<string>();
  for (const match of input.matchAll(internalLinkPattern)) {
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

export function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 220);
  return slug || "page";
}