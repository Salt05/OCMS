/**
 * Evaluates string arithmetic expressions (e.g. "5+10+23" -> 38)
 * and enforces integer values (no decimals allowed).
 */
export function parseQuantityInput(input: string | number | null | undefined, fallback = 1): number {
  if (input === null || input === undefined) return fallback;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input) : fallback;
  }

  const str = String(input).trim();
  if (!str) return fallback;

  // Replace commas with dots if any, but filter allowed chars for math expressions
  const sanitized = str.replace(/,/g, '.');

  // If string only contains allowed arithmetic chars: digits, +, -, *, /, %, (, ), ., spaces
  if (/^[0-9+\-*/%().\s]+$/.test(sanitized)) {
    try {
      // Safe evaluation using Function
      const fn = new Function(`return (${sanitized});`);
      const result = fn();
      if (typeof result === 'number' && Number.isFinite(result)) {
        return Math.round(result);
      }
    } catch {
      // Fall back if syntax error while user is mid-typing
    }
  }

  // Fallback: parse standard integer
  const parsed = parseInt(sanitized, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
