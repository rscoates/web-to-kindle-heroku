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

## Official Rail Data departures

The dashboard requests National Rail's public JSON `GetDepBoardWithDetails/WEA`
operation through Rail Data Marketplace, with `filterCrs=TCR`, `filterType=to`,
9 services, and a 120-minute window. Calling points confirm a direct service to
Tottenham Court Road even when the train terminates elsewhere. Scheduled and
expected departure/arrival times come from the board and TCR calling point.
Cancelled services/calls, replacement buses and connections requiring a change
are excluded. The existing walking-time/journey-duration filters and cache apply.

Set these **server-side** environment variables before deploying:

- `RAIL_DATA_API_KEY`: the consumer key for your approved **Live Departure Board
  public JSON** subscription. This is the consumer key, not the consumer secret.
- `RAIL_DATA_BASE_URL` (optional): the approved product base URL, ending in
  `/LDBWS/api/20220120`. The default is
  `https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120`.
  Confirm the product/version in your subscription's Specification tab and
  override this value if it differs. Only HTTPS on `api1.raildata.org.uk` is
  accepted; redirects are disabled so the consumer key stays on that gateway.

The key is sent in the `x-apikey` header and is never embedded in HTML, browser
JavaScript, diagnostic data, or logs. Missing configuration is shown separately
from an API failure. HTTP failures (including 401/403 and 429) retain their status
in the existing diagnostics and are retried on the next page request. There is no
automatic fallback to the public Huxley proxy.

For restricted deployment environments, allow outbound HTTPS to
`api1.raildata.org.uk`. Restart the application after changing configuration.
Check `/page`: expand **Train status** to check the provider, counts and fetch
time, or inspect `[Trains]` browser-console logs. An empty board is not proof of
no services outside the API's 120-minute window. The existing screenshot cache
can delay visible changes until the next minute.

API contract reference: [National Rail LDBWS OpenAPI specification](https://realtime.nationalrail.co.uk/LDBWS/static/ldbws.json).
Subscription/provider reference: [National Rail Darwin data feeds](https://www.nationalrail.co.uk/developers/darwin-data-feeds/).
The gateway product URL and consumer key must match the approved Rail Data
Marketplace subscription. Automated tests use synthetic responses matching the
public JSON schema; a live authenticated smoke test is still required once the
key and network access are configured.
