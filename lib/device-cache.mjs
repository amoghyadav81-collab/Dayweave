export const cachePrefix = (userId) => "dayweave:v2:" + userId;
export function readDeviceSnapshot(storage, userId) {
  const key = cachePrefix(userId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.state?.scope !== userId) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}
export function clearDeviceSnapshot(storage, userId) {
  const prefix = cachePrefix(userId);
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === prefix || key?.startsWith(prefix + ":")) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
