'use client';

import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useState } from 'react';

export interface TraceViewerProps {
  trace: {
    id: string;
    timestamp: string;
    artifactVersion: string;
    tenantId: string;
    eliminations: Array<{
      nodeId: string;
      reason: string;
      eliminated?: string[];
    }>;
    scores: Record<string, number>;
    arbitration: {
      formula: string;
      winner: string;
    };
    timings: Record<string, number>;
  };
  onReplay?: () => Promise<void>;
}

export function TraceViewer({ trace, onReplay }: TraceViewerProps) {
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<{ identical: boolean } | null>(null);

  const handleReplay = async () => {
    if (!onReplay) return;
    setIsReplaying(true);
    try {
      await onReplay();
      setReplayResult({ identical: true });
    } catch (err) {
      setReplayResult({ identical: false });
    } finally {
      setIsReplaying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Elimination Cascade */}
      <Card>
        <CardHeader>
          <CardTitle>Elimination Cascade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {trace.eliminations.map((elim, i) => (
              <div
                key={i}
                className="p-3 border border-base-300 rounded flex items-start gap-3"
              >
                <span className="text-2xl">→</span>
                <div className="flex-1">
                  <p className="font-mono text-sm text-base-900">{elim.nodeId}</p>
                  <p className="text-sm text-base-600 mt-1">{elim.reason}</p>
                  {elim.eliminated?.length && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {elim.eliminated.map((e, j) => (
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
            {Object.entries(trace.scores).map(([action, score]) => (
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
                {trace.arbitration.formula}
              </code>
            </p>
            <div className="mt-4">
              <Badge variant="pass" className="text-lg px-4 py-2">
                ✓ Winner: {trace.arbitration.winner}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Replay */}
      {onReplay && (
        <Card>
          <CardHeader>
            <CardTitle>Prove Determinism</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-base-600">
              Re-execute this decision to prove byte-identical reproducibility.
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
              <div
                className={`p-4 border-2 rounded ${
                  replayResult.identical
                    ? 'border-state-pass bg-green-50'
                    : 'border-state-block bg-red-50'
                }`}
              >
                <p className="font-semibold text-base-900">
                  {replayResult.identical ? '✓ IDENTICAL' : '✗ DIFFERENT'}
                </p>
                <p className="text-sm text-base-600 mt-1">
                  {replayResult.identical
                    ? 'Decision reproduced exactly. Platform is deterministic.'
                    : 'Replay produced different output. Please investigate.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timings */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Timings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(trace.timings).map(([node, ms]) => (
              <div key={node} className="flex justify-between items-center">
                <span className="text-sm font-mono">{node}</span>
                <span className="text-sm text-base-600">{ms.toFixed(1)}ms</span>
              </div>
            ))}
            <div className="border-t border-base-300 pt-2 mt-2 flex justify-between items-center font-semibold">
              <span className="text-sm">Total</span>
              <span className="text-sm">
                {Object.values(trace.timings)
                  .reduce((a, b) => a + b, 0)
                  .toFixed(1)}
                ms
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
