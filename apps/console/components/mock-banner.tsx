'use client';

import { useEffect, useState } from 'react';

export function MockBanner() {
  const [isMockMode, setIsMockMode] = useState(false);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_USE_MSW === 'true') {
      setIsMockMode(true);
    }
  }, []);

  if (!isMockMode) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-100 border-b-2 border-yellow-400 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-yellow-900">🔧 MOCK MODE</span>
        <span className="text-sm text-yellow-800">
          All API calls are mocked via MSW. Real backend not available.
        </span>
      </div>
      <div className="text-xs text-yellow-700">
        See{' '}
        <code className="bg-yellow-50 px-2 py-1 rounded font-mono">
          docs/gaps.md
        </code>{' '}
        for pending APIs
      </div>
    </div>
  );
}
