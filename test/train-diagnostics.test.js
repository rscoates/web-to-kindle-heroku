// A dummy key keeps provider tests offline; never use a real credential here.
process.env.RAIL_DATA_API_KEY = 'test-only';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { Settings } = require('luxon');
const pug = require('pug');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const freshBoard = () => {
  delete require.cache[require.resolve('../get_trains_raildata')];
  return require('../get_trains_raildata').getBoard;
};

test('board distinguishes HTTP/network failures, invalid responses, empty boards, filtered boards and trains', async () => {
  const originalGet = axios.get;
  const originalNow = Settings.now;
  const originalError = console.error;
  try {
    Settings.now = () => Date.parse('2026-10-24T10:00:00+01:00');
    console.error = () => {};
    for (const error of [Object.assign(Error('secret URL'), {response: {status: 503}}), Object.assign(Error('secret URL'), {code: 'ECONNABORTED'})]) {
      let calls = 0;
      axios.get = async () => { calls++; throw error; };
      const getBoard = freshBoard();
      const result = await getBoard();
      assert.equal(result.diagnostics.status, 'error');
      assert.equal(result.diagnostics.httpStatus, error.response?.status ?? null);
      assert.ok(!JSON.stringify(result).includes('secret URL'));
      await getBoard();
      assert.equal(calls, 2);
    }
    for (const data of [{}, '<html>Error</html>', {trainServices: {}}]) {
      axios.get = async () => ({data});
      assert.equal((await freshBoard()()).diagnostics.status, 'error');
    }
    for (const data of [{trainServices: []}, {locationName: 'West Ealing', trainServices: null}]) {
      axios.get = async () => ({data});
      const result = await freshBoard()();
      assert.equal(result.diagnostics.status, 'empty');
      assert.equal(result.diagnostics.reason, 'no_services');
    }
    const service = std => ({std, etd: 'On time', subsequentCallingPoints: [{callingPoint: [{crs: 'TCR', st: '10:30'}]}]});
    for (const [std, status, count] of [['10:05', 'empty', 0], ['10:15', 'ok', 1]]) {
      axios.get = async () => ({data: {trainServices: [service(std)]}});
      const result = await freshBoard()();
      assert.equal(result.diagnostics.status, status);
      assert.equal(result.diagnostics.servicesReceived, 1);
      assert.equal(result.rows.length, count);
      if (!count) assert.equal(result.diagnostics.reason, 'no_matching_services');
    }
  } finally { axios.get = originalGet; Settings.now = originalNow; console.error = originalError; }
});

test('rendered diagnostics are safe, visible and logged at the right browser console level', () => {
  for (const [status, reason, expected] of [
    ['error', 'api_failure', 'Train data unavailable (API failure)'],
    ['empty', 'no_services', 'No upcoming trains'],
    ['empty', 'no_matching_services', 'No trains match the journey filters']
  ]) {
    const diagnostics = {status, reason, message: '</script><script>alert(1)</script>', checkedAt: 'now'};
    const html = pug.renderFile(path.join(__dirname, '../views/index.pug'), {
      trains: [], trainDiagnostics: diagnostics, reminders: [], recycling: {}, date: '10:00'
    });
    assert.ok(html.includes(expected));
    assert.ok(!html.includes(diagnostics.message));
    const json = html.match(/<script id="train-diagnostics-data" type="application\/json">(.*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(json), diagnostics);
    const logs = [];
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/train-diagnostics.js'), 'utf8'), {
      document: {getElementById: () => ({textContent: json})},
      console: {error: (...args) => logs.push(['error', ...args]), info: (...args) => logs.push(['info', ...args])}
    });
    assert.equal(logs[0][0], status === 'error' ? 'error' : 'info');
    assert.equal(logs[0][1], '[Trains] ' + status);
  }
});
