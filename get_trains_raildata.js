const { createCache } = require('./cache');
const axios = require('axios');
const { DateTime } = require('luxon');

const source = 'WEA';
const destination = 'TCR';
const DIRECT_JOURNEY_MAX = 30;
const TIME_TO_STATION_MINUTES = 11;
const ON_TIME = 'On time';
const ZONE = 'Europe/London';
const DEFAULT_BASE_URL = 'https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120';

function requestConfig() {
  const apiKey = process.env.RAIL_DATA_API_KEY?.trim();
  if (!apiKey) throw Object.assign(new Error('Rail Data API key is not configured'), { code: 'RAIL_DATA_NOT_CONFIGURED' });
  const base = new URL(process.env.RAIL_DATA_BASE_URL || DEFAULT_BASE_URL);
  // Keep the key on the official gateway, including when a product version changes.
  if (base.protocol !== 'https:' || base.hostname !== 'api1.raildata.org.uk'
    || base.port || base.username || base.password || base.search || base.hash) {
    throw Object.assign(new Error('Invalid Rail Data base URL'), { code: 'RAIL_DATA_INVALID_CONFIG' });
  }
  return {
    url: `${base.href.replace(/\/$/, '')}/GetDepBoardWithDetails/${source}`,
    options: {
      headers: { 'x-apikey': apiKey, Accept: 'application/json', 'User-Agent': 'WebToKindle/1.0' },
      params: { numRows: 9, filterCrs: destination, filterType: 'to', timeOffset: 0, timeWindow: 120 },
      timeout: 15000,
      maxRedirects: 0
    }
  };
}

// Board times have no date. Choose the nearest day to handle midnight departures.
const parseTime = (time, reference) => {
  if (!/^\d{2}:\d{2}$/.test(time ?? '')) return null;
  const parsed = DateTime.fromFormat(`${reference.toISODate()} ${time}`, 'yyyy-MM-dd HH:mm', { zone: ZONE });
  if (!parsed.isValid) return null;
  const difference = parsed.diff(reference).as('hours');
  if (difference < -12) return parsed.plus({ days: 1 });
  if (difference > 12) return parsed.minus({ days: 1 });
  return parsed;
};

const getTrains = async () => {
  const now = DateTime.now().setZone(ZONE);
  const { url, options } = requestConfig();
  const response = await axios.get(url, options);
  const board = response.data;
  if (!board || typeof board !== 'object' || Array.isArray(board)
    || board.error || board.errors || board.fault
    || (!('trainServices' in board) && !board.locationName)
    || (board.crs && board.crs !== source)
    || (board.trainServices != null && !Array.isArray(board.trainServices))) {
    throw new Error('Invalid train board response');
  }
  const services = board.trainServices ?? [];

  const rows = services
    .filter((service) => !service.isCancelled && !service.filterLocationCancelled
      && (!service.serviceType || service.serviceType === 'train'))
    .map((service) => {
      const arrival = (service.subsequentCallingPoints ?? [])
        .filter((group) => !group.serviceChangeRequired && !group.assocIsCancelled)
        .flatMap((group) => group.callingPoint ?? [])
        .find((point) => point.crs === destination);
      if (!arrival || arrival.isCancelled) return null;

      return {
        arrivalDue: arrival.at || arrival.et || ON_TIME,
        arrivalScheduled: arrival.st,
        departureDue: service.etd || ON_TIME,
        departureScheduled: service.std
      };
    })
    .filter((row) => {
      if (!row) return false;
      const scheduledDeparture = parseTime(row.departureScheduled, now);
      if (!scheduledDeparture) return false;
      const departure = row.departureDue === ON_TIME
        ? scheduledDeparture
        : parseTime(row.departureDue, scheduledDeparture);
      const arrival = parseTime(row.arrivalScheduled, scheduledDeparture);
      // Unknown delays cannot be used to decide whether there is time to walk.
      if (!departure || !arrival) return false;

      const timeToDeparture = departure.diff(now).as('minutes');
      const duration = arrival.diff(scheduledDeparture).as('minutes');
      return timeToDeparture > TIME_TO_STATION_MINUTES
        && duration >= 0 && duration <= DIRECT_JOURNEY_MAX;
    })
    .slice(0, 3);
  const departures = rows.map(row => {
    const scheduled = parseTime(row.departureScheduled, now);
    return row.departureDue === ON_TIME ? scheduled : parseTime(row.departureDue, scheduled);
  });
  return { rows, diagnostics: {
    status: rows.length ? 'ok' : 'empty', provider: 'National Rail / Rail Data',
    checkedAt: DateTime.now().toISO(),
    source, destination, servicesReceived: services.length, servicesDisplayed: rows.length,
    reason: rows.length ? null : services.length ? 'no_matching_services' : 'no_services',
    minimumMinutesToDeparture: TIME_TO_STATION_MINUTES, maximumJourneyMinutes: DIRECT_JOURNEY_MAX
  }, nextDeparture: departures.length
    ? Math.min(...departures.map(time => time.toMillis())) : null };

};

const cachedTrains = createCache(getTrains, (data, now) =>
  data.nextDeparture === null ? now.toMillis()
    : Math.max(now.toMillis(), data.nextDeparture - 30 * 60 * 1000));

async function getBoard() {
  try {
    return await cachedTrains();
  } catch (error) {
    const diagnostics = {
      status: 'error', provider: 'National Rail / Rail Data', checkedAt: DateTime.now().toISO(), source, destination,
      reason: ['RAIL_DATA_NOT_CONFIGURED', 'RAIL_DATA_INVALID_CONFIG', 'ERR_INVALID_URL'].includes(error.code)
        ? 'configuration_error' : 'api_failure', httpStatus: error.response?.status ?? null,
      code: error.code ?? null,
      message: error.code === 'RAIL_DATA_NOT_CONFIGURED' ? 'Set RAIL_DATA_API_KEY on the server'
        : ['RAIL_DATA_INVALID_CONFIG', 'ERR_INVALID_URL'].includes(error.code) ? 'Check RAIL_DATA_BASE_URL on the server'
        : error.response ? `Train API returned HTTP ${error.response.status}`
        : error.code === 'ECONNABORTED' ? 'Train API request timed out'
        : error.message === 'Invalid train board response' ? error.message : 'Train API request failed'
    };
    console.error('Train board unavailable:', diagnostics);
    return { rows: [], diagnostics };
  }
}

module.exports = async () => (await getBoard()).rows;
module.exports.getBoard = getBoard;
