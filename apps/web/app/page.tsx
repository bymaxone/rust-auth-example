/**
 * @fileoverview Overview placeholder — a single glass card so the app has a root
 * route. The real auth-health overview lands with the console pages.
 *
 * @module app/page
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

/** The `/` route: a minimal Overview shell. */
export default function OverviewPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>rust-auth-example</CardTitle>
          <CardDescription>Reference console for @bymax-one/rust-auth.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The auth console shell is ready. Sign-in flows and the dashboard land in later phases.
        </CardContent>
      </Card>
    </main>
  );
}
