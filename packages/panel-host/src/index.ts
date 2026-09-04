/**
 * METIS Panel Host
 * Runtime for third-party UI panels with two trust tiers:
 *
 * - Signed/first-party: ESM modules, share React tree, full capability access
 * - Unsigned/customer-authored: sandboxed iframe, postMessage bridge, limited scopes
 *
 * In both cases, the panel never sees a bearer token.
 * The capability bridge checks the panel's declared scopes and gates API access.
 */

export interface PanelManifest {
  id: string;
  name: string;
  version: string;
  kind: 'panel' | 'node-renderer' | 'theme';

  // Which layout slots this panel can occupy
  supportedSlots: string[];

  // Data contract: which API scopes this panel needs
  requiredScopes: string[];

  // Permissions this panel needs
  permissions: string[];

  // Minimum viewport size
  minWidth: number;
  minHeight: number;

  // Trust tier
  trust: 'signed' | 'unsigned';
}

export interface CapabilityBridgeOptions {
  panelManifest: PanelManifest;
  userPermissions: string[];
  apiClient: any; // @metis/client
}

export interface CapabilityBridge {
  // Panel requests data via this interface, not directly via fetch
  fetch: (operationId: string, params?: Record<string, any>) => Promise<any>;

  // Token is never visible to the panel
  // Bridge handles auth internally
  setAuthToken: (token: string) => void;

  // Theme tokens injected as CSS variables
  setThemeTokens: (tokens: Record<string, string>) => void;
}

export function createCapabilityBridge(_options: CapabilityBridgeOptions): CapabilityBridge {
  return {
    fetch: async (_operationId: string, _params?: Record<string, any>) => {
      // Check if panel has scope for this operation
      // If not, return permission denied
      // Otherwise, call the API on behalf of the panel
      throw new Error('Not implemented');
    },
    setAuthToken: (_token: string) => {
      // Internal only
    },
    setThemeTokens: (_tokens: Record<string, string>) => {
      // Inject into panel context
    },
  };
}

export interface PanelHostProps {
  manifest: PanelManifest;
  slot: string;
  bridge: CapabilityBridge;
}

export function PanelHost(props: PanelHostProps): React.ReactNode {
  if (props.manifest.trust === 'signed') {
    // Load ESM module and render as trusted component
    return null; // TODO
  } else {
    // Render in sandboxed iframe with postMessage bridge
    return null; // TODO
  }
}
