/**
 * Copy text to the clipboard, returning whether it actually worked.
 *
 * `navigator.clipboard` only exists in a secure context (HTTPS, or localhost).
 * Oblak is often reached over plain HTTP on a LAN address, where that API is
 * undefined, so a bare `navigator.clipboard.writeText` silently does nothing.
 * This falls back to a hidden textarea and `document.execCommand('copy')`,
 * which works in that case, and reports success so callers do not tell the user
 * something was copied when it was not.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // The modern path, when it is available.
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or otherwise blocked; fall through to the fallback.
    }
  }

  // The legacy path, for non-secure contexts.
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Keep it out of view and out of the layout, but still selectable.
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
