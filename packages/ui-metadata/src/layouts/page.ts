/**
 * A route's `page.tsx`, read as a declared screen or not.
 *
 * A declared screen's page is `<Screen manifest="…" />` in its default export,
 * one import, and nothing else (ADR-015 §2). Anything more is a page doing its
 * own arranging. Comments and whitespace aside, the match is exact — which is
 * the point: the check this replaced accepted a route whose path appeared
 * anywhere in any file.
 *
 * One definition, because three checks need it: conformance's layout rule, its
 * mock-mode rule (a declared page names no data layer; the host that resolves
 * its sources does), and the route-authorisation test (a declared page is
 * guarded by `Screen`, not by itself).
 */
const SCREEN_PAGE =
  /^(?:(["'])use client\1;?)?import\{Screen\}from(["'])@\/components\/layouts\/screen\2;?exportdefaultfunction[A-Za-z_$][\w$]*\(\)\{return<Screenmanifest=(["'])([a-z0-9-]+)\3\/>;?\}$/;

/** The manifest id the page renders, or `null` when the page is not a declared screen. */
export function declaredScreen(pageSource: string): string | null {
  const code = pageSource
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, '');
  return SCREEN_PAGE.exec(code)?.[4] ?? null;
}
