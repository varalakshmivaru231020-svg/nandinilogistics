/**
 * The knowledge base's description is written with the design's small toolbar —
 * bold, italic, underline, lists, a heading and links — so what is stored is
 * HTML rather than plain text.
 *
 * It is written by people with permission, but it is still read back into other
 * people's browsers, so it is cut down to the tags that toolbar can produce
 * before it is stored. Anything else — a script, an iframe, an event handler,
 * a javascript: link — is dropped, not escaped, so the article reads the same
 * and carries nothing with it.
 */

const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "H3", "P", "BR", "A", "DIV", "SPAN"]);

/** Tags that carry nothing of their own: their text is kept, the tag is not. */
const UNWRAP = new Set(["DIV", "SPAN"]);

function safeHref(value: string): string | null {
  const href = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (href.startsWith("/") || href.startsWith("#")) return href;
  return null;
}

/**
 * Keeps the toolbar's tags and drops the rest. Pure string work — no DOM — so
 * it runs on the server, which is the only place it may be trusted to run.
 */
export function sanitiseRichText(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += escapeText(html.slice(i));
      break;
    }
    out += escapeText(html.slice(i, lt));
    const gt = html.indexOf(">", lt);
    if (gt === -1) break;
    const raw = html.slice(lt + 1, gt).trim();
    i = gt + 1;

    const closing = raw.startsWith("/");
    const name = (closing ? raw.slice(1) : raw).split(/[\s/>]/)[0].toUpperCase();
    if (!ALLOWED.has(name) || UNWRAP.has(name)) continue;

    if (closing) {
      out += `</${name.toLowerCase()}>`;
      continue;
    }
    if (name === "A") {
      const href = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(raw);
      const url = href ? safeHref(href[1] ?? href[2] ?? "") : null;
      out += url
        ? `<a href="${escapeText(url)}" target="_blank" rel="noopener noreferrer">`
        : "<a>";
      continue;
    }
    out += name === "BR" ? "<br>" : `<${name.toLowerCase()}>`;
  }
  return out.trim();
}

function escapeText(text: string): string {
  return text.replace(/&(?!(?:amp|lt|gt|quot|#\d+);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The article's words with no markup, for a card excerpt or a search index. */
export function richTextToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|h3|ul|ol)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
