'use client';

import { AppShell } from '@/components/app-shell';
import { MockBanner } from '@/components/mock-banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth-provider';
import { useTheme } from '@/components/theme-provider';

export default function Home() {
  const { user } = useAuth();
  const { colorScheme, density, setColorScheme, setDensity } = useTheme();

  return (
    <>
      <MockBanner />
      <AppShell>
        <div className="p-8 space-y-6 max-w-6xl">
          {/* Welcome Section */}
          <div>
            <h1 className="text-3xl font-bold text-base-900 mb-2">Welcome to METIS</h1>
            <p className="text-base-600">
              {user?.name} ({user?.email})
            </p>
          </div>

          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>U1 Foundation — In Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-base-600 font-semibold">Storybook</p>
                  <Badge variant="pass" className="mt-2">
                    ✓ Ready
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-base-600 font-semibold">Primitives</p>
                  <Badge variant="pass" className="mt-2">
                    ✓ Button, Input, Card, Badge
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-base-600 font-semibold">Shell</p>
                  <Badge variant="pass" className="mt-2">
                    ✓ Navigation + Layout
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-base-600">
                Theme system: <strong>{colorScheme}</strong> × <strong>{density}</strong>
              </p>
            </CardContent>
          </Card>

          {/* Theme Switcher */}
          <Card>
            <CardHeader>
              <CardTitle>Theme Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-base-900">Color Scheme</p>
                <div className="flex gap-2">
                  <Button
                    variant={colorScheme === 'light' ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => setColorScheme('light')}
                  >
                    ☀️ Light
                  </Button>
                  <Button
                    variant={colorScheme === 'dark' ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => setColorScheme('dark')}
                  >
                    🌙 Dark
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-base-900">Density</p>
                <div className="flex gap-2">
                  <Button
                    variant={density === 'compact' ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => setDensity('compact')}
                  >
                    ◀ Compact
                  </Button>
                  <Button
                    variant={density === 'comfortable' ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => setDensity('comfortable')}
                  >
                    ▶ Comfortable
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Capabilities */}
          <Card>
            <CardHeader>
              <CardTitle>Available Surfaces (U2+)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-base-900">Decision Architect</p>
                  <p className="text-xs text-base-600">Strategy list, canvas editor, compile panel</p>
                </div>
                <div>
                  <p className="font-medium text-base-900">Compliance Officer</p>
                  <p className="text-xs text-base-600">Decision search, trace explorer, replay</p>
                </div>
                <div>
                  <p className="font-medium text-base-900">Marketer</p>
                  <p className="text-xs text-base-600">Taxonomy browser, campaign builder</p>
                </div>
                <div>
                  <p className="font-medium text-base-900">Operator</p>
                  <p className="text-xs text-base-600">Health dashboard, deployment console</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resources */}
          <Card>
            <CardHeader>
              <CardTitle>Documentation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p>
                  📋{' '}
                  <code className="bg-base-200 px-2 py-1 rounded text-xs">
                    docs/EXPERIENCE_LAYER_STATUS.md
                  </code>{' '}
                  — Surface inventory
                </p>
                <p>
                  📝{' '}
                  <code className="bg-base-200 px-2 py-1 rounded text-xs">docs/gaps.md</code> —
                  Blocking APIs
                </p>
                <p>
                  🔌{' '}
                  <code className="bg-base-200 px-2 py-1 rounded text-xs">
                    docs/metis-api.openapi.yaml
                  </code>{' '}
                  — API spec
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </>
  );
}
