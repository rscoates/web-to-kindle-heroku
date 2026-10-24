// A dummy key keeps provider tests offline; never use a real credential here.
process.env.RAIL_DATA_API_KEY = 'test-only';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Settings, DateTime } = require('luxon');
const axios = require('axios');
const { dailyCache } = require('../cache');

const clock = iso => { Settings.now = () => Date.parse(iso); };
const fresh = name => { delete require.cache[require.resolve(name)]; return require(name); };

test('daily cache shares requests, caches empty successes, and expires at London midnight across DST', async () => {
  const originalNow = Settings.now;
  try {
    clock('2026-10-25T00:30:00+01:00');
    let calls = 0;
    const cached = dailyCache(async () => { calls++; return []; });
    await Promise.all([cached(), cached(), cached()]);
    assert.equal(calls, 1);
    clock('2026-10-25T23:59:00+00:00');
    await cached();
    assert.equal(calls, 1);
    clock('2026-10-26T00:00:00+00:00');
    await cached();
    assert.equal(calls, 2);
  } finally { Settings.now = originalNow; }
});

test('failed loads do not fill the daily cache', async () => {
  let calls = 0;
  const cached = dailyCache(async () => { if (++calls === 1) throw Error('offline'); return 42; });
  await assert.rejects(cached(), /offline/);
  assert.equal(await cached(), 42);
  assert.equal(await cached(), 42);
  assert.equal(calls, 2);
});

test('trains pause until exactly 30 minutes before the earliest usable departure, including midnight', async () => {
  const originalNow = Settings.now;
  const originalGet = axios.get;
  try {
    clock('2026-10-22T23:20:00+01:00');
    let calls = 0;
    const service = (std, arrival) => ({ std, etd: 'On time', subsequentCallingPoints: [{ callingPoint: [{ crs: 'TCR', st: arrival }] }] });
    axios.get = async () => { calls++; return { data: { trainServices: [service('01:00', '01:20'), service('00:30', '00:50')] } }; };
    const getTrains = fresh('../get_trains_raildata');
    assert.equal((await getTrains()).length, 2);
    clock('2026-10-22T23:59:59+01:00');
    await getTrains();
    assert.equal(calls, 1);
    clock('2026-10-23T00:00:00+01:00');
    await getTrains();
    assert.equal(calls, 2);
    await getTrains();
    assert.equal(calls, 3, 'poll normally inside the 30 minute window');
  } finally { Settings.now = originalNow; axios.get = originalGet; }
});

test('empty train boards are queried again rather than inventing a wake-up time', async () => {
  const originalGet = axios.get;
  try {
    let calls = 0;
    axios.get = async () => { calls++; return { data: { trainServices: [] } }; };
    const getTrains = fresh('../get_trains_raildata');
    await getTrains(); await getTrains();
    assert.equal(calls, 2);
  } finally { axios.get = originalGet; }
});

test('Monica caches an empty reminder list for the day and refreshes next day', async () => {
  const originalNow = Settings.now;
  const originalFetch = global.fetch;
  const token = process.env.MONICA_ACCESS_TOKEN;
  try {
    process.env.MONICA_ACCESS_TOKEN = 'test-only';
    clock('2026-10-22T10:00:00+01:00');
    let calls = 0;
    global.fetch = async () => { calls++; return { ok: true, json: async () => ({ data: [] }) }; };
    const getReminders = fresh('../get_reminders');
    assert.deepEqual(await getReminders(), []);
    await getReminders();
    assert.equal(calls, 1);
    clock('2026-10-23T00:00:00+01:00');
    await getReminders();
    assert.equal(calls, 2);
  } finally {
    Settings.now = originalNow; global.fetch = originalFetch;
    if (token === undefined) delete process.env.MONICA_ACCESS_TOKEN;
    else process.env.MONICA_ACCESS_TOKEN = token;
  }
});

test('recycling shares concurrent loads, retries errors, and refreshes the next day', async () => {
  const originalNow = Settings.now;
  const originalFetch = global.fetch;
  const originalError = console.error;
  try {
    clock('2026-10-22T10:00:00+01:00');
    let calls = 0;
    global.fetch = async () => { calls++; return { ok: calls > 1, status: 503, json: async () => ({ param2: [{ collectionDateString: '23/10/2026', Service: 'FOOD BOX' }] }) }; };
    console.error = () => {};
    const getRecycling = fresh('../get_recycling');
    assert.equal((await getRecycling()).date, 'Unknown');
    const results = await Promise.all([getRecycling(), getRecycling()]);
    assert.equal(results[0].types, 'Food Waste');
    assert.equal(calls, 2);
    await getRecycling();
    assert.equal(calls, 2);
    clock('2026-10-23T00:00:00+01:00');
    await getRecycling();
    assert.equal(calls, 3);
  } finally { Settings.now = originalNow; global.fetch = originalFetch; console.error = originalError; }
});

test('train cache shares concurrent requests, retries failures and uses delayed departure time', async () => {
  const originalNow = Settings.now;
  const originalGet = axios.get;
  const originalError = console.error;
  try {
    clock('2026-10-22T04:00:00+01:00');
    let calls = 0;
    console.error = () => {};
    axios.get = async () => {
      if (++calls === 1) throw Error('offline');
      return { data: { trainServices: [{ std: '05:00', etd: '05:15', subsequentCallingPoints: [{ callingPoint: [{ crs: 'TCR', st: '05:20' }] }] }] } };
    };
    const getTrains = fresh('../get_trains_raildata');
    assert.deepEqual(await getTrains(), []);
    await Promise.all([getTrains(), getTrains()]);
    assert.equal(calls, 2);
    clock('2026-10-22T04:44:59+01:00');
    await getTrains();
    assert.equal(calls, 2);
    clock('2026-10-22T04:45:00+01:00');
    await getTrains();
    assert.equal(calls, 3);
  } finally { Settings.now = originalNow; axios.get = originalGet; console.error = originalError; }
});
