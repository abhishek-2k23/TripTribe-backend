// lib/ttlCache.js
//
// A small in-memory cache with expiry and least-recently-used eviction, for proxied responses that
// are cheap to lose on restart (place searches, photo redirects, static map images). Anything that
// must survive a restart or be shared between instances belongs in MongoDB instead (PlaceCache).

export function createTtlCache({ ttlMs, maxEntries = 500, maxBytes = Infinity, sizeOf = () => 0 }) {
  const entries = new Map();
  let bytes = 0;

  const remove = (key) => {
    const entry = entries.get(key);
    if (!entry) return;
    bytes -= entry.size;
    entries.delete(key);
  };

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= Date.now()) {
        remove(key);
        return undefined;
      }
      // Re-insert so iteration order tracks recency.
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      remove(key);
      const size = sizeOf(value);
      if (size > maxBytes) return;
      entries.set(key, { value, size, expires: Date.now() + ttlMs });
      bytes += size;
      while (entries.size > maxEntries || bytes > maxBytes) remove(entries.keys().next().value);
    },
  };
}
