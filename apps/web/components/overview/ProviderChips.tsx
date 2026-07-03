/**
 * @fileoverview The email-provider + OAuth-status chip row for the Overview page.
 *
 * Two badges surface the configured delivery integrations: which email provider
 * is wired (Mailpit locally, Resend in production) and whether Google OAuth is
 * enabled. Each chip pairs a label with an icon so status is never colour-only.
 * Composes the design-system `Badge` verbatim.
 *
 * @module components/overview/ProviderChips
 */

import { KeyRound, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/** Props for {@link ProviderChips}. */
export interface ProviderChipsProps {
  /** The configured outbound email provider. */
  readonly emailProvider: 'mailpit' | 'resend';
  /** Whether Google OAuth is configured. */
  readonly oauthGoogleEnabled: boolean;
}

/** Render the email-provider and OAuth-status chips. */
export function ProviderChips({ emailProvider, oauthGoogleEnabled }: ProviderChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="gap-1 font-mono">
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-muted-foreground">email</span>
        {emailProvider}
      </Badge>
      <Badge variant={oauthGoogleEnabled ? 'default' : 'outline'} className="gap-1 font-mono">
        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
        <span className={oauthGoogleEnabled ? undefined : 'text-muted-foreground'}>
          Google OAuth
        </span>
        {oauthGoogleEnabled ? 'on' : 'off'}
      </Badge>
    </div>
  );
}
