// Reviewed exceptions to scripts/ui-check.mjs, each with the reason it is safe.
// dynamicCalls: { file, call, why } — an L( call whose arguments are not two string literals
//   (call is its source text; whitespace is collapsed before comparing).
// sizes: { file, value, why } — a font size the checker cannot resolve to at least 12px
//   (value as the checker prints it, lower case).
export default {
  dynamicCalls: [],
  sizes: [],
};
