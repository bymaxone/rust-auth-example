/**
 * @fileoverview `/platform/users` — read-only platform admin directory.
 *
 * Server component. Fetches `GET /platform/users` from the internal API using
 * the session cookie forwarded from the incoming request. Renders a read-only
 * table of every platform admin account (email · role · status · last sign-in).
 * No mutation controls are present — admin provisioning is out-of-band. A
 * domain-isolation banner reminds the viewer that only platform admins appear
 * here and tenant users live in the dashboard domain.
 *
 * @module app/platform/(protected)/users/page
 */

import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { AUTH_ACCESS_COOKIE_NAME } from '@bymax-one/rust-auth/shared';
import type { AuthPlatformUserClient } from '@bymax-one/rust-auth/shared';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL;
if (INTERNAL_API_URL === undefined || INTERNAL_API_URL === '') {
  throw new Error('INTERNAL_API_URL is required for the platform users page');
}

/**
 * Fetch the platform admin list from the internal API, forwarding the session
 * cookie so the `PlatformAdmin` guard on the Rust side can authenticate the
 * request. Throws on a non-2xx response so Next.js propagates the error.
 *
 * @returns The credential-free admin projections.
 * @throws {Error} When the API responds with a non-2xx status.
 */
async function fetchPlatformUsers(): Promise<AuthPlatformUserClient[]> {
  const jar = await cookies();
  const token = jar.get(AUTH_ACCESS_COOKIE_NAME)?.value;

  const res = await fetch(`${INTERNAL_API_URL}/platform/users`, {
    method: 'GET',
    headers: {
      ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {}),
    },
    // Opt out of Next.js full-route caching so every render sees fresh data.
    cache: 'no-store',
  });

  if (res.status === 401 || res.status === 403) {
    // The edge gate admitted the request, but the platform session lapsed before this
    // server-side fetch resolved — route the admin back to log in cleanly rather than
    // surfacing an error boundary.
    redirect('/platform/login?reason=session-expired');
  }
  if (!res.ok) {
    throw new Error(`GET /platform/users returned ${String(res.status)}`);
  }

  return (await res.json()) as AuthPlatformUserClient[];
}

/** Format an ISO-8601 date string as a localized date+time. */
function formatDate(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Platform admin directory page — read-only server component. */
export default async function PlatformUsersPage(): Promise<React.ReactElement> {
  const users = await fetchPlatformUsers();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Platform administrator accounts. Read-only — provisioning is out-of-band.
        </p>
      </div>

      {/* Domain-isolation banner */}
      <Alert>
        <AlertTitle>
          Platform domain — tenant users are managed from the dashboard console, not here.
        </AlertTitle>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform administrators</CardTitle>
          <CardDescription>
            {users.length === 1 ? '1 admin account' : `${String(users.length)} admin accounts`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--glass-border)">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Last sign-in
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No platform admin accounts found.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-(--glass-border) last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
                      <td className="px-4 py-3">{user.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          {user.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(user.lastLoginAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
