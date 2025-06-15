/// z set operations
const cyrb53 = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};
function hash(x, seed = 0) {
  if (typeof x === "string") return cyrb53(x, seed);
  if (typeof x === "number") return cyrb53(`n${x}`, seed);
  if (x instanceof Array) {
    let value = hash("[]", seed);
    for (const item of x) value = hash(item, value);
    return value;
  }
  throw new Error(`Unsupported type for hashing: ${typeof x}`);
}

class ZSet {
  constructor(items = []) {
    this.items = [];
    this.index = new Map();
    for (const item of items) {
      if (item.count === 0) continue;
      this.items.push({ ...item });
      const bucket = this.index_at(item.value);
      bucket.push(this.items.length - 1);
    }
  }
  static from_obj(obj) {
    return new ZSet(
      Object.entries(obj).map(([value, count]) => ({ value, count }))
    );
  }
  index_at(x) {
    const h = hash(x);
    if (this.index.has(h)) return this.index.get(h);
    let bucket = [];
    this.index.set(h, bucket);
    return bucket;
  }
  update(x, fn) {
    const bucket = this.index_at(x);
    for (const i of bucket) {
      const item = this.items[i];
      if (item.value === x && item.count !== 0) {
        item.count = fn(item.count);
        return;
      }
    }
    this.items.push({ value: x, count: fn(0) });
    bucket.push(this.items.length - 1);
  }
  clone() {
    return new ZSet(this.items);
  }
  add(other) {
    const result = this.clone();
    for (const item of other.items)
      result.update(item.value, (count) => count + item.count);
    return result;
  }
  neg() {
    const result = this.clone();
    for (const item of result.items) item.count = -item.count;
    return result;
  }
  distinct() {
    const result = new ZSet();
    for (const item of this.items)
      if (item.count > 0) result.update(item.value, () => 1);
    return result;
  }
  map(fn) {
    const result = new ZSet();
    for (const item of this.items) {
      const new_value = fn(item.value);
      if (new_value !== undefined)
        result.update(new_value, (count) => count + item.count);
    }
    return result;
  }
  filter(pred) {
    const result = new ZSet();
    for (const item of this.items)
      if (pred(item.value))
        result.update(item.value, (count) => count + item.count);
    return result;
  }
  product(other) {
    const result = new ZSet();
    for (const item of this.items)
      for (const other_item of other.items) {
        const new_value = [item.value, other_item.value];
        const inc = item.count * other_item.count;
        if (inc === 0) continue;
        result.update(new_value, (count) => count + inc);
      }
    return result;
  }
  project(column) {
    const result = new ZSet();
    for (const item of this.items)
      if (Object.hasOwn(item.value, column)) {
        const value = item.value[column];
        result.update(value, (count) => count + item.count);
      }
    return result;
  }
  join_on(other, column0, column1) {
    const result = new ZSet();
    for (const item of this.items) {
      if (!Object.hasOwn(item.value, column0)) continue;
      if (item.count === 0) continue;
      const value0 = item.value[column0];
      for (const other_item of other.items) {
        if (!Object.hasOwn(other_item.value, column1)) continue;
        if (other_item.count === 0) continue;
        const value1 = other_item.value[column1];
        if (value0 !== value1) continue;
        
        const inc = item.count * other_item.count;
        result.update([item.value, other_item.value], (count) => count + inc);
      }
    }
    return result;
  }
}
