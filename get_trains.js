const axios = require('axios');
const {DateTime} = require('luxon');

const WEST_EALING = 'WEA';
const TCR = 'TCR';
const DIRECT_JOURNEY_MAX = 30;
const TIME_NOW = new Date();
const TIME_TO_STATION_MINUTES = 10;
const TIME_TO_STATION = TIME_TO_STATION_MINUTES * 60 * 1000;
const ON_TIME = 'On time';

const source = WEST_EALING
const destination = TCR
const url = `https://departureboard-io-api-mj7fisk44q-nw.a.run.app/api/v1.0/getFormattedJourneyByCRS?sourceCRS=${source}&destCRS=${destination}`

const getTrains = async () => {
  try {
    const response = await axios.get(url)
    const data = response.data.data ?? []
    return data.filter((row) => {
      const departureTime = DateTime.now().setZone('Europe/London')
      // We only want to show trains that are more than 10 minutes away, and have a duration of less than 30 minutes (i.e. direct trains)
      let depatureTime = row['departureScheduled'];
      if (row['departureDue'] !== ON_TIME) {
        depatureTime = row['departureDue'];
      }
      const departureDateTime = DateTime.fromFormat(depatureTime, 'HH:mm').setZone('Europe/London');
      const timeToDeparture = departureDateTime.diffNow().as('milliseconds');
      const duration = DateTime.fromFormat(row['arrivalScheduled'], 'HH:mm').diff(DateTime.fromFormat(depatureTime, 'HH:mm')).as('minutes');
      return timeToDeparture > TIME_TO_STATION && duration <= DIRECT_JOURNEY_MAX;
    }).filter((_, idx) => idx < 4).map((row) => {
      const {
        arrivalDue, arrivalScheduled,
        departureDue, departureScheduled
      } = row
      return {arrivalDue, arrivalScheduled, departureDue, departureScheduled}
    })
  } catch (error) {
    console.error('Error fetching train data:', error.message)
    return []
  }
}

module.exports = getTrains
