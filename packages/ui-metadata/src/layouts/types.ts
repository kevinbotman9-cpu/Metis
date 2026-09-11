/**
 * Layout manifests: a screen declared as one instance of one pattern. ADR-015.
 *
 * A manifest names its pattern, fills that pattern's parameters, and places
 * occupants in the slots the pattern declares. It never declares a region of
 * its own — the arrangement, the keyboard path and the five states belong to
 * the pattern's renderer, written once, so improving list–detail is one change
 * rather than one per screen.
 *
 * Like a descriptor, a manifest is data: no React, no imports from the console,
 * no queries. A data source is a name the host resolves (§2), so a manifest can
 * never call `fetch`. It holds no permission and no persona either; those stay
 * in `apps/console/lib/nav`, where ADR-011 put them.
 */

/** Bumped when the format changes, so a renderer never reinterprets an old manifest silently. */
export const LAYOUT_FORMAT_VERSION = 1 as const;

/**
 * The closed set. One pattern today; the other six arrive as their first
 * screens are converted, each through its own renderer (ADR-015, *Build first*).
 */
export type PatternId = 'list-detail';

/** A panel placed in a slot. */
export interface Occupant {
  /**
   * Stable for the life of the manifest. A later overlay says "hide `rule`",
   * never "hide the second tab" — which breaks the day the vendor adds a first
   * (ADR-015 §7).
   */
  id: string;
  /** A panel `PANELS` declares. */
  panel: string;
  /** What the slot calls it — a tab's name. Required where the slot shows names. */
  label?: string;
  /** The panel's own parameters. Data, like everything else here. */
  params?: Readonly<Record<string, unknown>>;
}

/**
 * A value shown on a list row.
 *
 * A bare string is a field path, labelled by the descriptor. The object form is
 * for a field the descriptor does not have — a count the source derives — which
 * needs a label, and a unit so that "3" does not stand alone.
 */
export type ListColumn =
  | string
  | {
      field: string;
      label?: string;
      /** Singular and plural, for a number: `['offer', 'offers']` renders "1 offer". */
      unit?: readonly [string, string];
    };

export interface ListDetailParams {
  list: {
    /** A named source. The host resolves it to a generated-client call. */
    source: string;
    /** The row's first line and the detail pane's heading. */
    title: string;
    /** The row's second line, when there is one. */
    subtitle?: string;
    columns: readonly ListColumn[];
    /**
     * Fields to filter by, each with a closed set of values in the descriptor —
     * static options or boolean labels. Shown with counts, per §4.1.
     */
    facets: readonly string[];
    /** The order rows arrive in before anybody filters. */
    sort?: { field: string; dir: 'asc' | 'desc' };
    /** What an empty list says. Nothing to show is still something to explain. */
    empty: { title: string; description: string };
  };
  detail: {
    /**
     * A descriptor in the registry, or an entity `PENDING` there. Its edit form
     * is that descriptor and its overview renders the same fields read-only —
     * never repeated here (§6).
     */
    entity: string;
    /** The field shown beneath the heading. */
    description?: string;
    /**
     * The footer strip: version, state, last edit, author (§4.1). Each names a
     * field on the record; an entity with no version declares none, and the
     * strip shows none rather than an invented one.
     */
    footer: { version?: string; state?: string; editedAt?: string; editedBy?: string };
  };
  /**
   * The `[id]` route that deep-links a selection, or `null`. Only a route named
   * here is exempt from needing its own manifest (§5).
   */
  detailRoute: string | null;
}

export type ListDetailSlot = 'list.toolbar' | 'detail.tabs' | 'detail.aside' | 'detail.actions';

export interface ListDetailManifest {
  id: string;
  route: string;
  formatVersion: typeof LAYOUT_FORMAT_VERSION;
  pattern: 'list-detail';
  /** The page heading and the line beneath it. Labels are inline until ADR-005's catalogue exists. */
  title: string;
  description: string;
  params: ListDetailParams;
  slots: { [S in ListDetailSlot]?: readonly Occupant[] } & { 'detail.tabs': readonly Occupant[] };
}

export type LayoutManifest = ListDetailManifest;

/** What a pattern is, as data: the slots a manifest may fill. */
export interface PatternDeclaration {
  slots: readonly string[];
  /** Slots whose occupants the renderer names on screen, so each needs a label. */
  labelled: readonly string[];
}

/**
 * A panel, as the layout registry sees it: where it may go.
 *
 * The component is the console's; this is the declaration a manifest is checked
 * against, and the shape W-038's `ui-panel` packages will declare (ADR-015 §9).
 */
export interface PanelDeclaration {
  /** `<pattern>.<slot>` pairs this panel can fill. */
  slots: readonly string[];
  /** Entities it understands, when it is not generic. Absent means any. */
  entities?: readonly string[];
  /** What it shows, for whoever places it. */
  description: string;
}
