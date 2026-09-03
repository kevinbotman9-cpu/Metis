export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">METIS Console</h1>
        <p className="text-lg text-gray-600 mb-8">
          U0: Infrastructure scaffolding in progress
        </p>
        <div className="space-y-2 text-left inline-block">
          <p className="text-sm font-mono">
            <span className="text-gray-400">Phase:</span> U0 (Truth & Contracts)
          </p>
          <p className="text-sm font-mono">
            <span className="text-gray-400">Framework:</span> Next.js App Router
          </p>
          <p className="text-sm font-mono">
            <span className="text-gray-400">Status:</span> Scaffolding → Storybook → Routes
          </p>
          <p className="text-sm font-mono">
            <span className="text-gray-400">Demo target:</span> U2 (Trace Explorer)
          </p>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-4">Resources</p>
          <ul className="space-y-1 text-sm">
            <li>
              <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                docs/EXPERIENCE_LAYER_STATUS.md
              </code>
            </li>
            <li>
              <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                docs/gaps.md
              </code>
            </li>
            <li>
              <code className="bg-gray-100 px-2 py-1 rounded text-xs">CLAUDE.md</code>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
