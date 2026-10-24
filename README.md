# Web to Kindle

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Data caching

Caches are held in memory and reset when the service restarts. Recycling and
Monica reminders refresh on the first request each London calendar day (or when
no successful result has been cached). Successful empty reminder lists are cached;
failed requests are retried on the next request. Concurrent requests share a fetch.

If the earliest usable train is more than 30 minutes away, its board is cached
until 30 minutes before departure, using the expected departure time when delayed.
Within that window, or when there are no usable departures, normal polling resumes.
Refreshes are request-driven rather than background timers.

Run cache tests with `node --test test/cache.test.js`.

## Train diagnostics

The train panel distinguishes API failures, successful empty boards, and boards
with no services matching the journey filters (over 11 minutes to departure and
at most 30 minutes travelling). Expand **Train status** for the fetch timestamp,
received/displayed counts, or the HTTP status/error code. Browser console entries
start with `[Trains]`: failures use `console.error`, successful results use
`console.info`. These also appear in screenshot-generation server logs.
The timestamp is the API fetch time, including when the board is served from cache.
Failures and malformed responses are retried on the next page request; requests
time out after 15 seconds. No raw responses or request URLs are logged.

Run all checks with `node --test test/*.test.js`.
