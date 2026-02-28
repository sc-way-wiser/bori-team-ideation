/**
 * Extract [[Wiki Link]] titles from HTML or raw text content.
 * Returns an array of link titles (without brackets).
 * Lines inside <p data-commented="true"> are skipped — they're commented out.
 */
export function extractLinks(content) {
  // Strip commented paragraphs before extracting any [[links]]
  const stripped = content.replace(
    /<p[^>]*data-commented="true"[^>]*>.*?<\/p>/gs,
    "",
  );
  const raw = stripped.replace(/<[^>]*>/g, " ");
  const matches = [...raw.matchAll(/\[\[([^\]]+)\]\]/g)];
  return [...new Set(matches.map((m) => m[1].trim()))];
}

/**
 * Replace [[Title]] patterns in plain text with a span that can be
 * styled as a wiki link.
 */
export function renderWikiLinks(text) {
  return text.replace(/\[\[([^\]]+)\]\]/g, '<span class="mention">$1</span>');
}
