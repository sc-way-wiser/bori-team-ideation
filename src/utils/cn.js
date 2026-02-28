/**
 * Minimal classname utility — joins truthy strings, filters falsy values.
 * Drop-in for clsx without an extra dependency.
 */
export function cn(...args) {
  return args
    .flat(Infinity)
    .filter((v) => typeof v === "string" && v.length > 0)
    .join(" ");
}
