/**
 * @fileoverview Root layout — HTML shell for the auth console.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'rust-auth-example',
  description: 'Reference application for bymax-auth / @bymax-one/rust-auth.',
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Root layout wraps every page in the HTML document shell.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
