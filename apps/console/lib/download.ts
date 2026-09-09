/**
 * Hand a file to the person at the keyboard.
 *
 * There is no endpoint behind this and there should not be: the trace is
 * already in the browser, fetched through the generated client, and asking the
 * server to serialise it a second time would give the compliance officer a file
 * that might not match the screen they are looking at. Exporting what was
 * rendered is the stronger guarantee for evidence — the bytes correspond to
 * something a person actually read.
 *
 * `URL.revokeObjectURL` is deferred rather than immediate. Revoking in the same
 * tick races the browser's own read of the blob in WebKit, and the failure is a
 * silently empty file, which is worse than a leaked URL.
 */

/** Serialise `data` and download it as `filename`. Returns the bytes written. */
export function downloadJson(filename: string, data: unknown): number {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  // Firefox needs the element in the document for a programmatic click to
  // count as a user-initiated download.
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return text.length;
}

/**
 * A filename a person can find again six months later.
 *
 * Evidence gets filed, emailed and attached to tickets, so the name carries the
 * subject and the date rather than being unique-but-meaningless. Colons are
 * stripped because Windows refuses them and the download silently fails.
 */
export function evidenceFilename(prefix: string, id: string, when: string | Date): string {
  const date = typeof when === 'string' ? new Date(when) : when;
  const stamp = Number.isNaN(date.getTime())
    ? 'undated'
    : date.toISOString().slice(0, 10);
  return `${prefix}-${id}-${stamp}.json`;
}
