'use client';

import { MockBanner } from '@/components/mock-banner';
import { useState } from 'react';

export default function Home() {
  const [apiStatus, setApiStatus] = useState<string>('');

  const testApiCall = async () => {
    setApiStatus('Testing API...');
    try {
      const response = await fetch('/api/artifacts/telco-uk/test-strategy');
      if (response.ok) {
        const data = await response.json();
        setApiStatus(`✓ API working! Got artifact: ${data.id} v${data.version}`);
      } else {
        setApiStatus(`✗ API error: ${response.status}`);
      }
    } catch (error) {
      setApiStatus(`✗ Error: ${error}`);
    }
  };

  return (
    <>
      <MockBanner />
      <main className="min-h-screen flex items-center justify-center pt-12">
        <div className="text-center max-w-2xl">
          <h1 className="text-4xl font-bold mb-4">METIS Console</h1>
          <p className="text-lg text-gray-600 mb-8">
            U0: OpenAPI spec + MSW mocks ready
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 text-left">
            <p className="text-sm font-semibold text-blue-900 mb-3">✓ U0 Complete</p>
            <ul className="text-sm text-blue-800 space-y-1 font-mono">
              <li>✓ Next.js App Router with standalone output</li>
              <li>✓ Tailwind + CSS custom properties (token layer)</li>
              <li>✓ OpenAPI spec at docs/metis-api.openapi.yaml</li>
              <li>✓ MSW mock handlers for all endpoints</li>
              <li>✓ API client library at lib/api-client.ts</li>
              <li>✓ 8 UI packages scaffolded (ui-kit, client, canvas, etc.)</li>
              <li>✓ CLAUDE.md + EXPERIENCE_LAYER_STATUS.md + gaps.md</li>
            </ul>
          </div>

          <div className="space-y-2 text-left inline-block mb-8">
            <p className="text-sm font-mono">
              <span className="text-gray-400">Phase:</span> U0 → U1 (Foundation)
            </p>
            <p className="text-sm font-mono">
              <span className="text-gray-400">Framework:</span> Next.js App Router
            </p>
            <p className="text-sm font-mono">
              <span className="text-gray-400">State management:</span> TanStack Query + URL + Zustand
            </p>
            <p className="text-sm font-mono">
              <span className="text-gray-400">Demo target:</span> U2 (Trace Explorer)
            </p>
          </div>

          <button
            onClick={testApiCall}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mb-4"
          >
            Test Mock API
          </button>

          {apiStatus && (
            <div className="mb-6 p-3 bg-gray-100 rounded text-sm font-mono text-gray-700">
              {apiStatus}
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-4">Resources</p>
            <ul className="space-y-2 text-sm">
              <li>
                <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                  docs/EXPERIENCE_LAYER_STATUS.md
                </code>{' '}
                — Surface inventory
              </li>
              <li>
                <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                  docs/gaps.md
                </code>{' '}
                — Blocking APIs
              </li>
              <li>
                <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                  docs/metis-api.openapi.yaml
                </code>{' '}
                — Full spec
              </li>
              <li>
                <code className="bg-gray-100 px-2 py-1 rounded text-xs">CLAUDE.md</code> — Agent rules
              </li>
            </ul>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200 text-left">
            <p className="text-xs font-semibold text-gray-600 mb-3">Next: U1 (2–3 weeks)</p>
            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
              <li>Storybook with all Radix UI primitives</li>
              <li>Shell navigation + auth context</li>
              <li>Theme loading (4 axes: light/dark × compact/comfortable)</li>
              <li>i18n plumbing + string externalisation</li>
              <li>ESLint/Stylelint token enforcement</li>
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}
