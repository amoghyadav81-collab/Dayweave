import test from "node:test";
import assert from "node:assert/strict";
import {
  cachePrefix,
  readDeviceSnapshot,
  clearDeviceSnapshot,
} from "../lib/device-cache.mjs";
const storage = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
};
test("device snapshots require matching account scope and clearing never touches another account", () => {
  const s = storage();
  s.setItem(
    cachePrefix("A"),
    JSON.stringify({ state: { scope: "A", tasks: [{ title: "A private" }] } }),
  );
  s.setItem(
    cachePrefix("AB"),
    JSON.stringify({ state: { scope: "AB", tasks: [{ title: "B private" }] } }),
  );
  assert.equal(readDeviceSnapshot(s, "AB").state.tasks[0].title, "B private");
  s.setItem(cachePrefix("C"), s.getItem(cachePrefix("A")));
  assert.equal(readDeviceSnapshot(s, "C"), null);
  clearDeviceSnapshot(s, "A");
  assert.equal(readDeviceSnapshot(s, "A"), null);
  assert.equal(readDeviceSnapshot(s, "AB").state.scope, "AB");
});
