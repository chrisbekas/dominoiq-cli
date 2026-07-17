import renderMarkdown from "cli-markdown";

export function normalizeMarkdownResponse(responseText: string): string {
  let normalized = responseText;

  // check for JSON-encoded string (for example "\\*\\*bold\\*\\*")
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (typeof parsed === "string") {
        normalized = parsed;
      }
    } catch {
      // Keep the original text if it's not valid JSON.
    }
  }

  // unescape emphasis markers so escaped markdown can still be rendered
  return normalized
    .replace(/\\\*/g, "*")
    .replace(/\\_/g, "_")
    .replace(/\\`/g, "`");
}

export function shouldRenderMarkdown(text: string): boolean {
  const markdownPattern = /(^|\n)(#{1,6}\s|>\s|```|~~~|[-*+]\s|\d+\.\s|!\[|\[.+\]\(.+\)|[*_~]{1,2}[^*_~\n]+[*_~]{1,2}|^\s*\|.*\|)/m;
  return markdownPattern.test(text);
}

export function renderMarkdownResponse(responseText: string): string {
  const normalizedResponseText = normalizeMarkdownResponse(responseText);

  if (!shouldRenderMarkdown(normalizedResponseText)) {
    return normalizedResponseText;
  }

  return renderMarkdown(normalizedResponseText);
}
