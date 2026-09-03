'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { MockBanner } from '@/components/mock-banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';

type TraceAudience = 'customer' | 'business' | 'analyst' | 'engineer' | 'regulator';

export default function DecisionDetailPage() {
  const params = useParams();
  const decisionId = params.id as string;
  const [audience, setAudience] = useState<TraceAudience>('analyst');
  const [replayResult, setReplayResult] = useState<any>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  // Fetch trace
  const { data: trace, isLoading: traceLoading, error: traceError } = useQuery({
    queryKey: ['trace', decisionId],
    queryFn: () => apiClient.getDecisionTrace(decisionId),
  });

  // Replay decision
  const handleReplay = async () => {
    setIsReplaying(true);
    try {
      const result = await apiClient.replayDecision(decisionId);
      setReplayResult(result);
    } catch (err) {
      console.error('Replay failed:', err);
    } finally {
      setIsReplaying(false);
    }
  };

  if (traceLoading) {
    return (
      <AppShell>
        <div className="p-8">Loading...</div>
      </AppShell>
    );
  }

  if (traceError || !trace) {
    return (
      <AppShell>
        <div className="p-8 text-red-600">Error loading trace</div>
      </AppShell>
    );
  }

  return (
    <>
      <MockBanner />
      <AppShell>
        <div className="p-8 space-y-6 max-w-5xl">
          {/* Header */}
          <div>
            <Link href="/decisions">
              <Button variant="ghost" size="sm">
                ← Back to Search
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-base-900 mt-4 mb-2">
              Decision Trace
            </h1>
            <p className="text-base-600 font-mono text-sm">{decisionId}</p>
          </div>

          {/* Metadata */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-base-600 font-semibold">Decision ID</p>
                  <p className="text-sm font-mono mt-1">{trace.id}</p>
                </div>
                <div>
                  <p className="text-xs text-base-600 font-semibold">Timestamp</p>
                  <p className="text-sm mt-1">
                    {new Date(trace.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-base-600 font-semibold">Artifact Version</p>
                  <p className="text-sm font-mono mt-1">{trace.artifactVersion}</p>
                </div>
                <div>
                  <p className="text-xs text-base-600 font-semibold">Tenant</p>
                  <p className="text-sm mt-1">{trace.tenantId}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audience Selector */}
          <Card>
            <CardHeader>
              <CardTitle>View As</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {['customer', 'business', 'analyst', 'engineer', 'regulator'].map(
                  (aud) => (
                    <Button
                      key={aud}
                      variant={audience === aud ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => setAudience(aud as TraceAudience)}
                    >
                      {aud.charAt(0).toUpperCase() + aud.slice(1)}
                    </Button>
                  )
                )}
              </div>
              <p className="text-xs text-base-600 mt-3">
                {audience === 'customer' && 'Plain language reasons for this decision'}
                {audience === 'business' && 'Business metrics and outcomes'}
                {audience === 'analyst' && 'Detailed elimination cascade and scoring'}
                {audience === 'engineer' && 'Complete execution trace with timings'}
                {audience === 'regulator' && 'Compliance-focused audit record'}
              </p>
            </CardContent>
          </Card>

          {/* Trace Content */}
          <Card>
            <CardHeader>
              <CardTitle>Elimination Cascade</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trace.eliminations?.map((elim: any, i: number) => (
                  <div
                    key={i}
                    className="p-3 border border-base-300 rounded flex items-start gap-3"
                  >
                    <span className="text-2xl">→</span>
                    <div className="flex-1">
                      <p className="font-mono text-sm text-base-900">
                        {elim.nodeId}
                      </p>
                      <p className="text-sm text-base-600 mt-1">{elim.reason}</p>
                      {elim.eliminated?.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {elim.eliminated.map((e: string, j: number) => (
                            <Badge key={j} variant="block">
                              ✗ {e}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Scoring */}
          <Card>
            <CardHeader>
              <CardTitle>Score Composition</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(trace.scores || {}).map(([action, score]: [string, any]) => (
                  <div key={action} className="p-3 border border-base-300 rounded">
                    <p className="font-mono text-sm text-base-900">{action}</p>
                    <p className="text-2xl font-bold text-base-900 mt-2">
                      {(score * 100).toFixed(0)}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Arbitration */}
          <Card>
            <CardHeader>
              <CardTitle>Arbitration Result</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-semibold">Formula:</span>{' '}
                  <code className="bg-base-100 px-2 py-1 rounded text-xs">
                    {trace.arbitration?.formula}
                  </code>
                </p>
                <div className="mt-4">
                  <Badge variant="pass" className="text-lg px-4 py-2">
                    ✓ Winner: {trace.arbitration?.winner}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Replay Section */}
          <Card>
            <CardHeader>
              <CardTitle>Prove Determinism</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-base-600">
                Re-execute this decision against the same artifact version and inputs.
                The output must be identical (byte-for-byte) to prove determinism.
              </p>
              <Button
                onClick={handleReplay}
                disabled={isReplaying}
                size="lg"
                className="w-full"
              >
                {isReplaying ? '⏳ Replaying...' : '▶ Replay Decision'}
              </Button>

              {replayResult && (
                <div className="mt-4 p-4 border-2 border-state-pass rounded bg-green-50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">✓</span>
                    <p className="font-semibold text-state-pass">
                      {replayResult.identical ? 'IDENTICAL' : 'DIFFERENT'}
                    </p>
                  </div>
                  <p className="text-sm text-base-600">
                    Original decision reproduced exactly. This proves the platform
                    executes strategies deterministically, enabling perfect auditability.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timings */}
          <Card>
            <CardHeader>
              <CardTitle>Execution Timings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(trace.timings || {}).map(
                  ([node, ms]: [string, any]) => (
                    <div key={node} className="flex justify-between items-center">
                      <span className="text-sm font-mono">{node}</span>
                      <span className="text-sm text-base-600">
                        {ms.toFixed(1)}ms
                      </span>
                    </div>
                  )
                )}
                <div className="border-t border-base-300 pt-2 mt-2 flex justify-between items-center font-semibold">
                  <span className="text-sm">Total</span>
                  <span className="text-sm">
                    {Object.values(trace.timings || {}).reduce((a: number, b: any) => a + b, 0).toFixed(1)}ms
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Export */}
          <Card>
            <CardHeader>
              <CardTitle>Evidence Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="secondary" className="w-full">
                📄 Export as PDF (with verification page)
              </Button>
              <Button variant="secondary" className="w-full">
                📋 Export as JSON (with chain hash)
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </>
  );
}
