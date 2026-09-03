'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/app-shell';
import { MockBanner } from '@/components/mock-banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';

export default function DecisionsPage() {
  const [filters, setFilters] = useState({
    dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    action: '',
    segment: '',
  });

  // Fetch decisions based on filters
  const { data, isLoading, error } = useQuery({
    queryKey: ['decisions', filters],
    queryFn: () =>
      apiClient.searchDecisions({
        tenantId: 'telco-uk',
        dateFrom: filters.dateFrom + 'T00:00:00Z',
        dateTo: filters.dateTo + 'T23:59:59Z',
        action: filters.action || undefined,
        limit: 50,
      }),
    enabled: Boolean(filters.dateFrom && filters.dateTo),
  });

  const decisions = data?.decisions || [];

  return (
    <>
      <MockBanner />
      <AppShell>
        <div className="p-8 space-y-6 max-w-7xl">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-base-900 mb-2">Decision Search</h1>
            <p className="text-base-600">Find, replay, and audit every decision</p>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-base-900 mb-1">
                    From Date
                  </label>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) =>
                      setFilters({ ...filters, dateFrom: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-900 mb-1">
                    To Date
                  </label>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) =>
                      setFilters({ ...filters, dateTo: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-900 mb-1">
                    Action
                  </label>
                  <Input
                    placeholder="e.g., upsell_5g"
                    value={filters.action}
                    onChange={(e) =>
                      setFilters({ ...filters, action: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-900 mb-1">
                    Segment
                  </label>
                  <Input
                    placeholder="e.g., new_customers"
                    value={filters.segment}
                    onChange={(e) =>
                      setFilters({ ...filters, segment: e.target.value })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader>
              <CardTitle>
                Results ({isLoading ? '...' : decisions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <div className="text-red-600">Error loading decisions</div>
              ) : isLoading ? (
                <div className="text-base-600">Loading...</div>
              ) : decisions.length === 0 ? (
                <div className="text-base-600">No decisions found</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {decisions.map((decision: any) => (
                    <div
                      key={decision.id}
                      className="flex items-center justify-between p-3 rounded border border-base-300 hover:bg-base-50 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-mono text-base-900">
                          {decision.id}
                        </p>
                        <div className="flex gap-2 mt-1">
                          <span className="text-xs text-base-600">
                            {new Date(decision.timestamp).toLocaleString()}
                          </span>
                          <Badge variant="pass">
                            {decision.decision?.winner || 'N/A'}
                          </Badge>
                          <span className="text-xs text-base-600">
                            {decision.customerId}
                          </span>
                        </div>
                      </div>
                      <Link href={`/decisions/${decision.id}`}>
                        <Button size="sm" variant="ghost">
                          View Trace →
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Help */}
          <div className="text-sm text-base-600 space-y-1">
            <p>💡 Click "View Trace" to see the full decision reasoning, replay it, and export evidence.</p>
            <p>🔐 All traces are immutable and cryptographically verified for audit compliance.</p>
          </div>
        </div>
      </AppShell>
    </>
  );
}
