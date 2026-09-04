/**
 * METIS Panel SDK
 *
 * What third-party developers import to author a custom UI panel.
 *
 * Example:
 *
 *   import { usePanel, usePanelAPI } from '@metis/panel-sdk';
 *
 *   export function MyCustomPanel() {
 *     const { manifest } = usePanel();
 *     const api = usePanelAPI();
 *
 *     return (
 *       <div>
 *         <h2>{manifest.name}</h2>
 *         {/* Panel UI here *\/}
 *       </div>
 *     );
 *   }
 *
 *   export const manifest = {
 *     id: 'my-panel',
 *     name: 'My Custom Panel',
 *     version: '1.0.0',
 *     kind: 'panel',
 *     supportedSlots: ['main-inspector', 'sidebar'],
 *     requiredScopes: ['read:strategies', 'read:decisions'],
 *     permissions: [],
 *     minWidth: 300,
 *     minHeight: 400,
 *     trust: 'unsigned',
 *   };
 */

import type { PanelManifest, CapabilityBridge } from '@metis/panel-host';

export interface PanelContext {
  manifest: PanelManifest;
  bridge: CapabilityBridge;
}

// Provided by host via React context
export function usePanel(): PanelContext {
  throw new Error('usePanel must be called within a PanelHost');
}

// Use this instead of direct fetch
export function usePanelAPI() {
  const { bridge } = usePanel();
  return {
    fetch: bridge.fetch,
  };
}

// Re-export for manifest authoring
export type { PanelManifest } from '@metis/panel-host';
