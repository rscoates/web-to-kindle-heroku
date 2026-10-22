const { createCache } = require('./cache');
const axios = require('axios');
const { DateTime } = require('luxon');

const source = 'WEA';
const destination = 'TCR';
const DIRECT_JOURNEY_MAX = 30;
const TIME_TO_STATION_MINUTES = 11;
const ON_TIME = 'On time';
const ZONE = 'Europe/London';
const url = `https://huxley2.azurewebsites.net/departures/${source}/to/${destination}/5?expand=true`;

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
  const response = await axios.get(url);
  const services = response.data.trainServices ?? [];

  const rows = services
    .filter((service) => !service.isCancelled && !service.filterLocationCancelled)
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
  return { rows, nextDeparture: departures.length
    ? Math.min(...departures.map(time => time.toMillis())) : null };

};

const cachedTrains = createCache(getTrains, (data, now) =>
  data.nextDeparture === null ? now.toMillis()
    : Math.max(now.toMillis(), data.nextDeparture - 30 * 60 * 1000));

module.exports = async () => {
  try { return (await cachedTrains()).rows; } catch (error) {
    console.error('Error fetching train data:', error.message);
    return [];
  }
};
