/**
 * @fileoverview Root layout — the forced-dark HTML shell for the auth console.
 *
 * Geist Sans carries prose; Geist Mono carries every opaque machine value
 * (codes, tokens, JTIs, hashes). The client provider boundary lives in
 * `providers.tsx` so this stays a server component.
 *
 * @module app/layout
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'rust-auth-example — Auth Console',
  description: 'Reference console for @bymax-one/rust-auth.',
};

/** Forced-dark root document wrapping every page in the provider tree. */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
