const { DateTime } = require('luxon');

// Cache state lives in this process; restarting the service empties it.
function createCache(load, expiresAt) {
  let entry;
  let pending;
  return async () => {
    const now = DateTime.now().setZone('Europe/London');
    if (entry && now.toMillis() < entry.expires) return entry.value;
    if (!pending) {
      pending = Promise.resolve().then(load).then(value => {
        entry = { value, expires: expiresAt(value, DateTime.now().setZone('Europe/London')) };
        return value;
      }).finally(() => { pending = undefined; });
    }
    return pending;
  };
}

const dailyCache = load => createCache(load, (_, now) =>
  now.plus({ days: 1 }).startOf('day').toMillis());

module.exports = { createCache, dailyCache };
