/**
 * METIS Package System - Phase 2+
 * Extensibility framework for node types, channels, models, themes
 */

import * as crypto from 'crypto';

export interface MetisPackage {
  id: string;
  name: string;
  version: string;
  apiVersion: 'metis/v1';
  kind: 'node' | 'channel' | 'model-provider' | 'industry-pack' | 'regulatory-pack' | 'ui-panel' | 'theme' | 'agent' | 'connector';
  provides: string[];
  requires: Record<string, string>;
  extensionPoints: Record<string, any>;
  entryPoint?: string;
  signature: string;
  metadata?: {
    author?: string;
    license?: string;
    repository?: string;
  };
}

/**
 * Package registry - manages installed packages and resolution
 */
export class PackageRegistry {
  private packages: Map<string, MetisPackage> = new Map();
  private installed: Map<string, string> = new Map(); // id -> version

  /**
   * Register a package
   */
  register(pkg: MetisPackage): boolean {
    const key = `${pkg.id}@${pkg.version}`;

    // Verify signature (Phase 2 implements crypto verification)
    if (!this.verifySignature(pkg)) {
      console.warn(`Package ${key} has invalid signature`);
      return false;
    }

    this.packages.set(key, pkg);
    return true;
  }

  /**
   * Install a package (resolves dependencies)
   */
  async install(id: string, versionRange: string): Promise<boolean> {
    // Find best matching version
    const matching = Array.from(this.packages.keys())
      .filter((k) => k.startsWith(`${id}@`))
      .map((k) => k.split('@')[1])
      .filter((v) => this.satisfies(v, versionRange))
      .sort()
      .pop();

    if (!matching) {
      console.error(`No version of ${id} matches ${versionRange}`);
      return false;
    }

    const key = `${id}@${matching}`;
    const pkg = this.packages.get(key);
    if (!pkg) return false;

    // Install dependencies
    for (const [depId, depRange] of Object.entries(pkg.requires || {})) {
      if (!this.isInstalled(depId)) {
        const installed = await this.install(depId, depRange);
        if (!installed) return false;
      }
    }

    this.installed.set(id, matching);
    return true;
  }

  /**
   * Uninstall a package
   */
  uninstall(id: string): boolean {
    return this.installed.delete(id);
  }

  /**
   * Get installed packages
   */
  getInstalled(): Map<string, string> {
    return this.installed;
  }

  /**
   * Check if package is installed
   */
  isInstalled(id: string): boolean {
    return this.installed.has(id);
  }

  /**
   * Get a package
   */
  getPackage(id: string, version?: string): MetisPackage | undefined {
    const key = version ? `${id}@${version}` : `${id}@${this.installed.get(id)}`;
    return this.packages.get(key);
  }

  /**
   * Verify package signature (Phase 2 crypto)
   */
  private verifySignature(pkg: MetisPackage): boolean {
    // Stub: Phase 2 implements RSA/ECDSA verification
    // For now, accept all signatures
    return pkg.signature.length > 0 || true;
  }

  /**
   * Simple semver satisfies
   */
  private satisfies(version: string, range: string): boolean {
    // Stub: Phase 2 uses full semver
    if (range === '*') return true;
    if (range === version) return true;
    if (range.startsWith('^')) {
      const base = range.slice(1).split('.')[0];
      return version.split('.')[0] === base;
    }
    return true;
  }
}

/**
 * Extension point system - declares what can be extended
 */
export class ExtensionPointRegistry {
  private points: Map<string, ExtensionPoint> = new Map();

  register(name: string, point: ExtensionPoint): void {
    this.points.set(name, point);
  }

  get(name: string): ExtensionPoint | undefined {
    return this.points.get(name);
  }

  getAll(): Map<string, ExtensionPoint> {
    return this.points;
  }
}

export interface ExtensionPoint {
  name: string;
  description: string;
  interface: string;
  version: string;
}

// Global registries
export const packageRegistry = new PackageRegistry();
export const extensionPointRegistry = new ExtensionPointRegistry();

// Register core extension points
extensionPointRegistry.register('node-type', {
  name: 'node-type',
  description: 'Custom decision node type',
  interface: 'BaseNode',
  version: '1.0.0',
});

extensionPointRegistry.register('channel', {
  name: 'channel',
  description: 'Custom delivery channel',
  interface: 'Channel',
  version: '1.0.0',
});

extensionPointRegistry.register('model-provider', {
  name: 'model-provider',
  description: 'Custom model serving provider',
  interface: 'ModelProvider',
  version: '1.0.0',
});
