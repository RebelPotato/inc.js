/// z set operations
const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

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