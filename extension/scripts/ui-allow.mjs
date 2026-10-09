// Reviewed exceptions to scripts/ui-check.mjs, each with the reason it is safe.
// Each entry covers one occurrence: the file and line the checker reports. If the code moves,
// the entry goes stale and the check fails until the line is updated.
// dynamicCalls: { file, line, call, why } — an L( call whose arguments are not two string literals
//   (call is its source text; whitespace is collapsed before comparing).
// sizes: { file, line, value, why } — a font size the checker cannot resolve to at least 12px
//   (value as the checker prints it, lower case).
export default {
  dynamicCalls: [],
  sizes: [],
};
