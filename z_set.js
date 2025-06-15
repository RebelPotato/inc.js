/// z set operations
function z_set_add(a, b) {
  const result = [];
  for (const [x, count] of Object.entries(a)) result[x] = count;
  for (const [x, count] of Object.entries(b)) {
    result[x] = (result[x] || 0) + count;
    if (result[x] === 0) delete result[x];
  }
  return result;
}
function z_set_neg(a) {
  const result = {};
  for (const [x, count] of Object.entries(a)) result[x] = -count;
  return result;
}
function z_set_distinct(a) {
  const result = {};
  for (const x of Object.keys(a)) if (a[x] > 0) result[x] = 1;
  return result;
}
function z_set_map(a, fn) {
  const result = {};
  for (const x of Object.keys(a)) {
    const y = fn(x);
    if (y !== undefined) result[y] = (result[y] || 0) + a[x];
  }
  return result;
}
const z_set_filter = (a, pred) =>
  z_set_map(a, (x) => (pred(x) ? x : undefined));
function z_set_product(a, b) {
  const result = {};
  for (const x of Object.keys(a))
    for (const y of Object.keys(b)) {
      const key = [x, y];
      result[key] = a[x] * b[y];
    }
  return result;
}