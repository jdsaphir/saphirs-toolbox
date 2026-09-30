import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Notes can come from anywhere: a .md file opened with 📂, or text an AI agent
// wrote through the agent API. marked passes raw HTML straight through, and the
// overlay has the whole window.toolbox API, so a note like
// `<img src=x onerror="…">` or `[x](javascript:…)` must never reach the DOM as-is.
// DOMPurify drops scripts, event handlers and anything that isn't plain
// document markup; links may only point at web or mail addresses, local files
// (or anchors). A file: link does nothing in the page itself: clicking it goes
// to the main process, which decides whether the file is safe to open.
// DOMPurify checks every attribute value against this, not just URLs, so it's
// its default pattern with the scheme list cut down: http(s)/mailto/file, or a
// value with no scheme at all (like `checkbox` or `#heading`).
const SAFE_URL = /^(?:(?:https?|mailto|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  ALLOWED_URI_REGEXP: SAFE_URL,
  FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select'],
  FORBID_ATTR: ['style'],
};

// Task lists (`- [x] done`) are the only reason to keep <input>: marked renders
// them as disabled checkboxes. Any other input (file pickers, password boxes…)
// goes, and checkboxes stay read-only.
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName !== 'input' || !(node instanceof HTMLInputElement)) return;
  if (node.type === 'checkbox') node.disabled = true;
  else node.remove();
});

export function renderMarkdown(source: string): string {
  const html = marked.parse(source || '', { async: false }) as string;
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}
