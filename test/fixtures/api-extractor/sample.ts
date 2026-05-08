/**
 * Sample input for the API reference extractor.
 *
 * This file is parsed by the extractor in tests; it is not part of the project's
 * tsc build. It deliberately exercises every supported symbol kind and JSDoc tag.
 */

/**
 * A simple function used by the docs.
 *
 * @param input the raw value to greet
 * @param times how many times to repeat the greeting
 * @returns the greeting string
 * @example
 * greet('world', 2);
 * // => 'hello world hello world'
 * @since 0.1.0
 */
export function greet(input: string, times: number): string {
  return Array.from({ length: times }, () => `hello ${input}`).join(' ');
}

/**
 * A widget that does widget things.
 *
 * @see {@link greet}
 */
export class Widget {
  constructor(public readonly name: string) {}
}

/**
 * Configuration for the {@link Widget} factory.
 */
export interface WidgetConfig {
  name: string;
  enabled?: boolean;
}

/**
 * A union of supported widget shapes.
 */
export type WidgetShape = 'square' | 'circle' | 'triangle';

/**
 * Severity levels recognized by the system.
 *
 * @deprecated use the new SeverityV2 enum once it ships.
 */
export enum Severity {
  Low = 'low',
  Medium = 'medium',
  High = 'high'
}

/**
 * The default widget shape, exported as a constant.
 *
 * @customTag this is an unknown tag and should be preserved verbatim
 */
export const DEFAULT_SHAPE: WidgetShape = 'square';

/** This export is internal and must not appear in the rendered output.
 * @internal
 */
export function internalHelper(): void {
  // hidden from the public API.
}

// Plain non-exported helper — must not appear.
function notExported(): void {}
