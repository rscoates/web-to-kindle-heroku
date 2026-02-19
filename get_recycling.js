const axios = require('axios')
const { format } = require('date-fns')

const convertDate = (dateString) => {
  const [day, month, year] = dateString.split('/');
  return new Date(`${year}-${month}-${day}T00:00:00`);
}

const formatDate = (date) => {
  return format(date, 'EEEE, do MMMM');
}

const convertRecyclingType = (type) => {
  switch(type) {
    case 'BLACK RUBBISH WHEELIE BIN':
      return 'Black Rubbish';
    case 'FOOD BOX':
      return 'Food Waste';
    case "GARDEN WASTE BIN (SUBSCRIPTION ONLY)":
      return 'Garden Waste';
    case 'BLUE RECYCLING WHEELIE BIN':
      return 'Blue Recycling';
    default:
      return type;
  }
}

const getRecycling = async () => {
  try {
    const response = await fetch("https://www.ealing.gov.uk/site/custom_scripts/WasteCollectionWS/home/FindCollection", {
      "headers": {
      "accept": "*/*",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "sec-ch-ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Google Chrome\";v=\"144\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-requested-with": "XMLHttpRequest",
      "cookie": "PHPSESSID=2c90187931b13ac85ff757c364c05943; TestCookie=Test; NSC_xxx.fbmjoh.hpw.vl=ffffffff0908611845525d5f4f58455e445a4a42378b; CookieControl=%7B%22necessaryCookies%22%3A%5B%5D%2C%22iabConsent%22%3A%22MIRQpgmg8hBS7TgUQCIEFYCEkDlhQDEBnNABQH0BzNJU6tAdwEkAZAdhwCVyBxc8gEYANADYAnALQCBAZgBsAMwAuAa0gAPBQE5yACzFsiIdZkoDYKgEwAWAgC8WANwDqbWAyEzLSDkjsBDJQBHCABpAFtOJjQAVxkAFUwmEBwRAAlYACsAVU4ANWBdUKZKPLE7FCJ%2FJABPbIB7eKVQ2DlMFQBLAgBZAC0ISyUIYAJ1R3DrJUznEGBe60cxci0ARgATLXD4iRw2NclLNbsayzZdADtHGX8dCQBlFezYDrXQiDAlFAVHAA5ezFC23ITGyOnUEkcC2s5G6AgADkhLBIwA9zuQlM5HHDrHYtBIII4KGs4eF1EoJPEagoFGx%2BPwxGiwGwhPwAMbkK52fhaIQs2nkCT8BQCulCkU%2FAiberkTLCpRiGoycg4JRsLSkSw1UjdAmChgrLSWJgQSgMHBWASs4AAVhEMjEaxU1nYbGAa3CHV6GJW3QI8SYKjQQnhlBUTB4lkyKnUQSYQV0IBESBAoRW1t0ljwvVCT0sSfIaBqnBQ4W6RAEziImGA1hkdlZznUYiYmG6PyEKwFchiEjssF4WhinYEUGt1oEawYdhkbCUYH4sH8QSQ6igIm6pGcmSuEm6lBE%2FYUKlC8%2BhCnbPwU4RwAAYOgIFKRF0rLGIhJYfgJBayhGiYjeZAGchYGtUhHB0OktFpRx9n4GJhTYflyDERxljpYVRVFVD%2BAkNA0CAA%3D%3D%22%2C%22statement%22%3A%7B%22shown%22%3Atrue%2C%22updated%22%3A%2219%2F02%2F2019%22%7D%2C%22consentDate%22%3A1769001999636%2C%22consentExpiry%22%3A90%2C%22interactedWith%22%3Atrue%2C%22user%22%3A%22CF545BF9-7EF5-4B4A-8D83-B373427DC035%22%2C%22addtlConsent%22%3A%22Aw18ZUQjCeQaJ4VTUt0vzHHyiC%2B20Z5ulFB6wBNZWDphFstMmb31r5zjRLTyphPcUNacJ2ASLHtFhHMT4z1GzVu3q5O%2FfD1UeRlgaV0J9C%2BNPK1bO0uvzccp4pIrLO7%2FJpcMiQmZkTGViEYkg6irj7cRgxOHgph9iHR4eaZvFl5OVmqgqKYybm6vFE2eIGVMVQotfWx%2BdXF8e1tQo0ldMH8neldFYPdVtJ9LiKJcQnRfg3zQ4ICXFU2qsFMqbMte3Oehj5TGSPHBkUd59d9w%2FETqQ93lF5SltuOz4v3u69ql%2FsrsgekCAoxiNIJv0jqNbpN3hsHgDbkjUfgVB9rgDkbIDgVNJCgbFSsSYlCSVJ0cDpkdoe9Xo1CZxmZMvJCqagmEy1k8aiUopsWT1SmyufSUYZ%2BsyTj9moS4ecttL%2BBC2aSOnT4YyFOSltSiOykUTORCNej2ZL5QqJS9SDKEVCYdTGXSedl3R7PV7vbYfX7%2FQHA2cgyGIqHwxHI1HowGUjH4wnE0nkyn3XHU74M5H01mCbn8wXC0Xi%2BGcyXyxXK1XqzXa3X6w3G03my3W232x3O13uwWyz3%2BwO84PhyPR2Px0m%2B42pxPZ3P5wvF0vlyvRzPVxvN1vtzvdx713vD0fj%2FoDyfzxfT5fO2fr5O7w%2FH0%2Bw8%2FX2%2F3x%2FP1%2Fvz%2Ff3%2F%2FwBgFAcBsJriB4HaLeVZQXWMFFnBEGIUhyEoahaHoRhvaYdhOG4Xh%2BEEdkCHlsRhFkeRFGUVR1E0bRdH0QxjFMcxLGsWx7EcZxXHcTxvEhqRfGCUJwkiaJYniRJ%2FYCZJMmyXJ8kKYpSnKSpW7SapGmaXh6lYVpeniTpZGGfpJmmWZ5jGVmln4dZ5l2fZQ7zrZDkua5h7OW5nleRpHneX5%2FkBYFQXBSFTG%2BaFEWRVF0V6eFMUvvF1FxYlKWpWl6UZZlWXZV8OV5flBWFUVxUlaVJFlWhyUVdVNW1fudVZVVDWDk1zVte1HWdV13V2a12aLn1PVDcNI2jWN40UYNpYDRNs1zS2U2IYtGXLfNnWrWtm1bVpG2Brtfr7dtR3HSdZmHadF2XVd103a5MBAA%3D%3D%3D%22%7D",
      "Referer": "https://www.ealing.gov.uk/site/custom_scripts/wasteCollectionWS/"
    },
    "body": "UPRN=12074069",
    "method": "POST"
  });

  const data = await response.json();

  const recyclingInfo = data['param2'].map((item) => {
    return {
      date: convertDate(item['collectionDateString']),
      type: item['Service']
    }
  }).sort((a, b) => a.date - b.date);

  // Get all collections for the next date
  const nextDate = recyclingInfo[0].date;
  const nextCollections = recyclingInfo.filter(item => item.date.getTime() === nextDate.getTime());

    return {
      date: formatDate(nextCollections[0].date),
      types: nextCollections.map(e => e.type).map(convertRecyclingType).join(', ')
    }
  } catch (error) {
    console.error('Error fetching recycling data:', error.message)
    return { date: 'Unknown', types: 'Unable to fetch recycling data' }
  }
};

module.exports = getRecycling;
