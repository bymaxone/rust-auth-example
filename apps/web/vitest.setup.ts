/**
 * @fileoverview Vitest global setup — jest-dom matchers + jsdom shims.
 *
 * Loaded once per test file via `vitest.config.ts#test.setupFiles`, so DOM
 * assertions such as `toBeInTheDocument()` are available everywhere. The shims
 * back-fill the pointer/scroll APIs jsdom omits but Radix overlays touch when
 * they open, so menu and dialog interactions can be exercised in tests.
 *
 * @module vitest.setup
 */

import '@testing-library/jest-dom';

// jsdom omits the pointer/scroll APIs Radix overlays touch on open; back-fill no-ops.
const elementProto = Element.prototype as unknown as Record<string, unknown>;
elementProto['scrollIntoView'] ??= () => undefined;
elementProto['hasPointerCapture'] ??= () => false;
elementProto['releasePointerCapture'] ??= () => undefined;
