'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { MockBanner } from '@/components/mock-banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MOCK_TRACE } from './trace-demo';

export default function DecisionDetailPage({ params }: { params: { id: string } }) {
  const [audience, setAudience] = useState('Customer');
  const [replayResult, setReplayResult] = useState<string | null>(null);

  const audiences = ['Customer', 'Business', 'Analyst', 'Engineer', 'Regulator'];

  return (
    <>
      <MockBanner />
      <AppShell>
        <div className="p-8 space-y-6 max-w-5xl">
          {/* Header with Back Button */}
          <div className="mb-8">
            <Link href="/decisions" className="inline-block mb-4">
              <Button variant="ghost" size="sm" className="hover:bg-base-200">
                ← Back to Decisions
              </Button>
            </Link>
            <h1 className="text-4xl font-bold text-base-900 mb-2">Decision Trace</h1>
            <p className="text-lg text-base-600">
              Complete, immutable audit record for decision {MOCK_TRACE.id}
            </p>
          </div>

          {/* Metadata Card */}
          <Card className="border-base-300 bg-base-100/50">
            <CardHeader className="border-b border-base-300 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Decision Metadata</CardTitle>
                <span className="text-xs text-state-pass font-semibold">✓ VERIFIED</span>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-xs font-semibold text-base-600 mb-1">Decision ID</p>
                  <p className="text-sm font-mono text-accent break-all">{MOCK_TRACE.id}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-base-600 mb-1">Timestamp</p>
                  <p className="text-sm">
                    {new Date(MOCK_TRACE.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-base-600 mb-1">Artifact Version</p>
                  <p className="text-sm font-mono">{MOCK_TRACE.artifactVersion}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-base-600 mb-1">Tenant</p>
                  <p className="text-sm">{MOCK_TRACE.tenantId}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audience Toggle */}
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm font-semibold text-base-900">View for:</span>
            <div className="flex gap-2 flex-wrap">
              {audiences.map((aud) => (
                <button
                  key={aud}
                  onClick={() => setAudience(aud)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    audience === aud
                      ? 'bg-accent text-white'
                      : 'bg-base-300 text-base-900 hover:bg-base-400'
                  }`}
                >
                  {aud}
                </button>
              ))}
            </div>
          </div>

          {/* Elimination Cascade */}
          <Card className="border-base-300">
            <CardHeader className="border-b border-base-300 pb-4">
              <CardTitle className="text-lg">Elimination Cascade</CardTitle>
              <p className="text-xs text-base-600 mt-1">
                Step-by-step decision flow showing which candidates survived filtering
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {MOCK_TRACE.eliminations.map((step, idx) => (
                  <div key={idx} className="relative">
                    {idx < MOCK_TRACE.eliminations.length - 1 && (
                      <div className="absolute left-5 top-12 w-0.5 h-8 bg-base-300" />
                    )}
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-semibold text-sm">
                        {idx + 1}
                      </div>
                      <div className="flex-1 p-4 rounded-lg border border-base-300 bg-white hover:border-accent transition-colors">
                        <p className="font-mono text-sm text-accent font-semibold">
                          {step.nodeId}
                        </p>
                        <p className="text-sm text-base-700 mt-2">{step.reason}</p>
                        {step.eliminated.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {step.eliminated.map((e) => (
                              <Badge key={e} variant="block" className="text-xs">
                                ✕ {e}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Score Composition */}
          <Card className="border-base-300">
            <CardHeader className="border-b border-base-300 pb-4">
              <CardTitle className="text-lg">Score Composition</CardTitle>
              <p className="text-xs text-base-600 mt-1">
                How each candidate was scored against the decision formula
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {Object.entries(MOCK_TRACE.scores)
                  .sort(([, a], [, b]) => b - a)
                  .map(([action, score]) => (
                    <div key={action}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-base-900">
                          {action}
                        </span>
                        <span className="text-sm font-mono text-accent font-bold">
                          {(score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-base-300 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-accent to-state-pass h-3 rounded-full transition-all"
                          style={{ width: `${score * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Arbitration Result */}
          <Card className="border-2 border-state-pass bg-state-pass/5">
            <CardHeader className="border-b border-state-pass pb-4">
              <CardTitle className="text-lg text-state-pass">Arbitration Result</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div>
                <p className="text-xs font-semibold text-base-600 mb-2">Ranking Formula</p>
                <div className="p-3 rounded bg-white border border-base-300 font-mono text-sm text-base-900">
                  {MOCK_TRACE.arbitration.formula}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-base-600 mb-3">Selected Action</p>
                <Badge variant="pass" className="text-base px-4 py-2">
                  ✓ {MOCK_TRACE.arbitration.winner}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Replay Section */}
          <Card className="border-base-300">
            <CardHeader className="border-b border-base-300 pb-4">
              <CardTitle className="text-lg">Verify Determinism</CardTitle>
              <p className="text-xs text-base-600 mt-1">
                Re-execute this decision with identical inputs to prove reproducibility
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Button
                  onClick={() => setReplayResult('✓ IDENTICAL')}
                  size="lg"
                  variant="default"
                  className="w-full text-lg font-semibold"
                >
                  ▶ Replay This Decision
                </Button>
                {replayResult && (
                  <div className="p-4 rounded-lg bg-state-pass/10 border-2 border-state-pass">
                    <p className="text-lg font-bold text-state-pass">{replayResult}</p>
                    <p className="text-xs text-base-700 mt-2">
                      Decision output matches historical trace exactly. Same inputs + same
                      artifact version = byte-identical result (determinism guaranteed).
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Execution Timings */}
          <Card className="border-base-300">
            <CardHeader className="border-b border-base-300 pb-4">
              <CardTitle className="text-lg">Execution Timings</CardTitle>
              <p className="text-xs text-base-600 mt-1">
                Per-node latency breakdown (SLA: &lt;50ms total)
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {Object.entries(MOCK_TRACE.timings).map(([node, ms]) => (
                  <div key={node} className="flex justify-between items-center">
                    <span className="text-sm font-mono text-accent">{node}</span>
                    <div className="flex-1 mx-4 bg-base-300 rounded h-2">
                      <div
                        className="bg-accent rounded h-2"
                        style={{ width: `${(ms / 15) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono font-semibold text-base-900">
                      {ms.toFixed(1)}ms
                    </span>
                  </div>
                ))}
                <div className="border-t border-base-300 pt-3 mt-3 flex justify-between">
                  <span className="font-semibold text-base-900">Total Latency</span>
                  <span className="font-mono font-bold text-state-pass text-lg">
                    {Object.values(MOCK_TRACE.timings)
                      .reduce((a, b) => a + b, 0)
                      .toFixed(1)}
                    ms
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Export Section */}
          <Card className="border-base-300">
            <CardHeader className="border-b border-base-300 pb-4">
              <CardTitle className="text-lg">Export Evidence</CardTitle>
              <p className="text-xs text-base-600 mt-1">
                Download cryptographically signed proof for compliance audits
              </p>
            </CardHeader>
            <CardContent className="pt-6 flex gap-3 flex-wrap">
              <Button variant="secondary" size="sm" className="flex items-center gap-2">
                📄 Export as PDF
              </Button>
              <Button variant="secondary" size="sm" className="flex items-center gap-2">
                ⬇️ Download JSON
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </>
  );
}
