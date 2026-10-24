const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { Settings } = require('luxon');
const fresh = () => {
  delete require.cache[require.resolve('../get_trains_raildata')];
  return require('../get_trains_raildata').getBoard;
};

async function sandbox(run) {
  const saved = {get: axios.get, now: Settings.now, error: console.error,
    key: process.env.RAIL_DATA_API_KEY, base: process.env.RAIL_DATA_BASE_URL};
  try {
    process.env.RAIL_DATA_API_KEY = 'test-only-consumer-key';
    delete process.env.RAIL_DATA_BASE_URL;
    Settings.now = () => Date.parse('2026-10-24T10:00:00+01:00');
    console.error = () => {};
    await run();
  } finally {
    axios.get = saved.get; Settings.now = saved.now; console.error = saved.error;
    for (const [name, value] of [['RAIL_DATA_API_KEY', saved.key], ['RAIL_DATA_BASE_URL', saved.base]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

const service = (overrides = {}) => ({
  std: '10:15', etd: '10:18', serviceType: 'train',
  destination: [{crs: 'SNF', locationName: 'Shenfield'}],
  subsequentCallingPoints: [{callingPoint: [
    {crs: 'EAL', st: '10:18', et: '10:21'},
    {crs: 'TCR', st: '10:35', et: '10:38'}
  ]}], ...overrides
});

test('requests the official detailed WEA-to-TCR board and preserves real-time predictions', () => sandbox(async () => {
  axios.get = async (url, options) => {
    assert.equal(url, 'https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120/GetDepBoardWithDetails/WEA');
    assert.equal(options.headers['x-apikey'], 'test-only-consumer-key');
    assert.equal(options.headers.Accept, 'application/json');
    assert.deepEqual(options.params, {numRows: 9, filterCrs: 'TCR', filterType: 'to', timeOffset: 0, timeWindow: 120});
    assert.equal(options.timeout, 15000);
    assert.equal(options.maxRedirects, 0);
    return {data: {crs: 'WEA', locationName: 'West Ealing', trainServices: [service()]}};
  };
  const board = await fresh()();
  assert.deepEqual(board.rows, [{departureScheduled: '10:15', departureDue: '10:18', arrivalScheduled: '10:35', arrivalDue: '10:38'}]);
  assert.equal(board.diagnostics.status, 'ok');
  assert.ok(!JSON.stringify(board).includes('test-only-consumer-key'));
}));

test('excludes cancellations, replacement buses, changes of train, missing TCR and unknown delays', () => sandbox(async () => {
  const services = [service({isCancelled: true}), service({filterLocationCancelled: true}),
    service({serviceType: 'bus'}), service({etd: 'Delayed'}),
    service({subsequentCallingPoints: [{serviceChangeRequired: true, callingPoint: [{crs: 'TCR', st: '10:35'}]}]}),
    service({subsequentCallingPoints: [{callingPoint: [{crs: 'TCR', st: '10:35', isCancelled: true}]}]}),
    service({subsequentCallingPoints: [{callingPoint: [{crs: 'PAD', st: '10:35'}]}]})];
  axios.get = async () => ({data: {crs: 'WEA', trainServices: services}});
  const board = await fresh()();
  assert.deepEqual(board.rows, []);
  assert.equal(board.diagnostics.reason, 'no_matching_services');
}));

test('missing credentials and invalid configuration never make an API request', () => sandbox(async () => {
  axios.get = async () => { assert.fail('must not send credentials'); };
  delete process.env.RAIL_DATA_API_KEY;
  assert.equal((await fresh()()).diagnostics.reason, 'configuration_error');
  process.env.RAIL_DATA_API_KEY = 'test-only-consumer-key';
  for (const base of ['http://api1.raildata.org.uk/api', 'https://example.com/api', 'https://api1.raildata.org.uk@evil.example/api', 'not-a-url', 'https://api1.raildata.org.uk/api?key=secret']) {
    process.env.RAIL_DATA_BASE_URL = base;
    const board = await fresh()();
    assert.equal(board.diagnostics.reason, 'configuration_error');
    assert.ok(!JSON.stringify(board).includes(base));
  }
}));

test('supports a subscribed product version and retries auth, quota and gateway failures without exposing credentials', () => sandbox(async () => {
  process.env.RAIL_DATA_BASE_URL = 'https://api1.raildata.org.uk/subscribed-product/LDBWS/api/20220120/';
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    axios.get = async (url) => {
      assert.ok(url.includes('/subscribed-product/'));
      calls++;
      throw Object.assign(Error('test-only-consumer-key'), {response: {status}, config: {headers: {'x-apikey': 'test-only-consumer-key'}}});
    };
    const getBoard = fresh();
    const result = await getBoard();
    assert.equal(result.diagnostics.status, 'error');
    assert.equal(result.diagnostics.httpStatus, status);
    assert.ok(!JSON.stringify(result).includes('test-only-consumer-key'));
    await getBoard();
    assert.equal(calls, 2);
  }
  axios.get = async () => ({data: {fault: {faultstring: 'gateway failure'}, locationName: 'West Ealing'}});
  assert.equal((await fresh()()).diagnostics.status, 'error');
}));
