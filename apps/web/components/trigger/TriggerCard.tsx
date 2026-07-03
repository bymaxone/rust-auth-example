/**
 * @fileoverview A single Trigger Center card: fire one action, show the raw I/O.
 *
 * Renders the action button and, once fired, the raw request + response JSON in
 * mono, a status/code badge row, and — when the action tripped a rate limit — a
 * live `Retry-After` countdown. Composes the design-system `Card`/`Button`/`Badge`
 * verbatim. The result shape is already secret-redacted by `lib/trigger-actions`.
 *
 * @module components/trigger/TriggerCard
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TriggerResult } from '@/lib/trigger-actions';

/** Props for {@link TriggerCard}. */
export interface TriggerCardProps {
  /** The card title (the feature being fired). */
  readonly title: string;
  /** A one-line description of what firing does. */
  readonly description: string;
  /** The button label. Defaults to `'Fire'`. */
  readonly actionLabel?: string;
  /** Fire the action; resolves to the raw {@link TriggerResult} to display. */
  readonly onFire: () => Promise<TriggerResult>;
}

/** A ticking `Retry-After` countdown badge. */
function RetryCountdown({ seconds }: { readonly seconds: number }): React.ReactElement {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    setRemaining(seconds);
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [seconds]);
  return (
    <Badge variant="destructive" className="font-mono">
      Retry-After {remaining}s
    </Badge>
  );
}

/** A labelled block of pretty-printed JSON in mono. */
function JsonBlock({ label, value }: { readonly label: string; readonly value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre className="bg-(--glass-bg) overflow-auto rounded-md p-3 font-mono text-xs text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** The status/code/retry badge row for a result. */
function ResultBadges({ result }: { readonly result: TriggerResult }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {result.status !== undefined && (
        <Badge variant="outline" className="font-mono">
          status {result.status}
        </Badge>
      )}
      {result.code !== undefined && (
        <Badge variant="destructive" className="font-mono" data-error-code={result.code}>
          {result.code}
        </Badge>
      )}
      {result.retryAfterSeconds !== undefined && (
        <RetryCountdown seconds={result.retryAfterSeconds} />
      )}
    </div>
  );
}

/**
 * A fire-one-feature card showing the raw request/response after firing.
 *
 * @param props - The card content and the fire handler.
 */
export function TriggerCard({
  title,
  description,
  actionLabel = 'Fire',
  onFire,
}: TriggerCardProps) {
  const [result, setResult] = useState<TriggerResult | null>(null);
  const [pending, setPending] = useState(false);

  async function fire(): Promise<void> {
    setPending(true);
    try {
      setResult(await onFire());
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button size="sm" disabled={pending} onClick={() => void fire()}>
          {pending ? 'Firing…' : actionLabel}
        </Button>
        {result !== null && (
          <div className="flex flex-col gap-3">
            <ResultBadges result={result} />
            <JsonBlock label="Request" value={result.request} />
            <JsonBlock label="Response" value={result.response} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
