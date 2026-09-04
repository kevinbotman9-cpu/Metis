'use client';

import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { MockBanner } from '@/components/mock-banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

// Mock decisions - using real data since MSW doesn't work server-side
const MOCK_DECISIONS = Array.from({ length: 15 }, (_, i) => ({
  id: `dec_${Math.random().toString(36).slice(2, 8)}`,
  artifactId: 'test-strategy',
  tenantId: 'telco-uk',
  customerId: `cust_${Math.random().toString(36).slice(2, 6)}`,
  timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
  decision: {
    winner: ['upsell_5g', 'upsell_data', 'retention', 'suppress'][Math.floor(Math.random() * 4)],
    candidates: [
      { id: 'upsell_5g', score: 0.87 },
      { id: 'upsell_data', score: 0.62 },
      { id: 'retention', score: 0.45 },
    ],
  },
}));

export default function DecisionsPage() {
  const [filters, setFilters] = useState({
    dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    action: '',
  });

  const filteredDecisions = MOCK_DECISIONS.filter(d => {
    if (filters.action && d.decision.winner !== filters.action) return false;
    return true;
  });

  return (
    <>
      <MockBanner />
      <AppShell>
        <div className="p-8 space-y-6 max-w-6xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-base-900 mb-2">Decision Search</h1>
            <p className="text-lg text-base-600">
              Find, inspect, and audit every decision made by METIS
            </p>
          </div>

          {/* Filters Card */}
          <Card className="border-base-300">
            <CardHeader className="border-b border-base-300 pb-4">
              <CardTitle className="text-lg">Search Filters</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-base-900 mb-2">
                    From Date
                  </label>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) =>
                      setFilters({ ...filters, dateFrom: e.target.value })
                    }
                    className="border-base-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-base-900 mb-2">
                    To Date
                  </label>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) =>
                      setFilters({ ...filters, dateTo: e.target.value })
                    }
                    className="border-base-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-base-900 mb-2">
                    Action
                  </label>
                  <Input
                    placeholder="All actions"
                    value={filters.action}
                    onChange={(e) =>
                      setFilters({ ...filters, action: e.target.value })
                    }
                    className="border-base-300"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card className="border-base-300">
            <CardHeader className="border-b border-base-300 pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">
                Decisions Found: {filteredDecisions.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {filteredDecisions.map((decision) => (
                  <Link key={decision.id} href={`/decisions/${decision.id}`}>
                    <div className="p-4 rounded-lg border border-base-300 hover:border-accent hover:bg-base-100 transition-all cursor-pointer group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-mono text-accent font-semibold group-hover:text-accent">
                            {decision.id}
                          </p>
                          <div className="flex flex-wrap gap-3 mt-2">
                            <span className="text-xs text-base-600">
                              📅 {new Date(decision.timestamp).toLocaleString()}
                            </span>
                            <Badge variant="pass" className="text-xs">
                              ✓ {decision.decision.winner}
                            </Badge>
                            <span className="text-xs text-base-600">
                              👤 {decision.customerId}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="default"
                          className="ml-4 whitespace-nowrap"
                        >
                          View Trace →
                        </Button>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Info */}
          <div className="bg-base-100 border border-base-300 rounded-lg p-6">
            <p className="text-sm text-base-600 mb-2">
              <strong>💡 How it works:</strong> Click any decision to see the complete reasoning trace, replay it to verify byte-identical reproducibility, and export cryptographic evidence for compliance.
            </p>
            <p className="text-sm text-base-600">
              <strong>🔐 Auditability:</strong> Every decision is immutable, linked to its artifact version, and carries chain-hash verification for tamper detection.
            </p>
          </div>
        </div>
      </AppShell>
    </>
  );
}
