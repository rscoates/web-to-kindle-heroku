const axios = require('axios');

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
      const departureTime = new Date()
      const [hours, minutes] = row['departureDue'] === ON_TIME ? row['departureScheduled'].split(':') : row['departureDue']
      departureTime.setHours(+hours)
      departureTime.setMinutes(+minutes)
      const duration = parseInt(row['duration'])
      return departureTime.valueOf() - TIME_NOW.valueOf() > TIME_TO_STATION && duration < DIRECT_JOURNEY_MAX
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
