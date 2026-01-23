const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');
const execFile = require('child_process').execFile;
const fs = require('fs');

const PORT = process.env.PORT || 3000;

async function waitForWidgetIcon(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      // Wait for the *right* iframe element (by src)
      const iframeHandle = await page.waitForSelector(
        'iframe[src*="forecast7.com"], iframe[src*="weatherwidget"]',
        { timeout: Math.min(5000, deadline - Date.now()) }
      );

      const frame = await iframeHandle.contentFrame();
      if (!frame) {
        // iframe exists but not attached yet; loop again
        continue;
      }

      // Wait inside the frame
      await frame.waitForSelector('.currentWeatherIcon', {
        timeout: Math.min(5000, deadline - Date.now()),
        visible: true,
      });

      return; // success
    } catch (e) {
      const msg = String(e?.message || e);

      // The key case you hit: the frame got replaced while waiting
      if (msg.includes('frame got detached') || msg.includes('Execution context was destroyed')) {
        continue; // retry until deadline
      }

      throw e; // other errors are real
    }
  }

  throw new Error('Timed out waiting for widget icon');
}

express()
  .use(express.static(path.join(__dirname, 'public')))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/', async (req, res) => {
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 600, height: 800 });

		// Logging (keep while debugging)
		page.on('requestfailed', r => console.log('FAILED', r.url(), r.failure()?.errorText));
		page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
		page.on('pageerror', err => console.log('PAGEERR', err));
		page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));

		const url = process.env.SCREENSHOT_URL || 'http://192.168.0.90:3004/page';
		await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });

		await page.waitForSelector('a.weatherwidget-io', { timeout: 30000 });
		await page.waitForFunction(() => typeof window.__weatherwidget_init === 'function', { timeout: 30000 });
		await page.evaluate(() => window.__weatherwidget_init());

		await waitForWidget(page, 30000);

		await page.waitForTimeout(300);
		await page.screenshot({ path: '/tmp/screenshot.png' });

		await convert('/tmp/screenshot.png');

		const screenshot = fs.readFileSync('/tmp/screenshot.png');
		res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': screenshot.length });
		return res.end(screenshot);
	} catch (err) {
		console.error(err);
		res.status(500).send('Screenshot failed');
	} finally {
		if (browser) await browser.close();
	}
  }).listen(PORT, () => console.log(`Listening on ${PORT}`));

function convert(filename) {
  return new Promise((resolve, reject) => {
    const args = [filename, '-gravity', 'center', '-extent', '600x800', '-colorspace', 'gray', '-depth', '8', filename];
    execFile('convert', args, (error, stdout, stderr) => {
      if (error) {
        console.error({ error, stdout, stderr });
        reject();
      } else {
        resolve();
      }
    });
  });
}

async function waitForWidget(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      // Wait until the widget iframe has the expected src
      const handle = await page.waitForSelector(
        'iframe[src*="weatherwidget"], iframe[src*="forecast7.com"]',
        { timeout: Math.min(5000, deadline - Date.now()) }
      );

      const frame = await handle.contentFrame();
      if (!frame) continue;

      // Wait for the thing you actually care about
      await frame.waitForSelector('.currentWeatherIcon', {
        visible: true,
        timeout: Math.min(5000, deadline - Date.now()),
      });

      return;
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('frame got detached') || msg.includes('Execution context was destroyed')) {
        continue; // iframe replaced; retry
      }
      throw e;
    }
  }

  throw new Error('Timed out waiting for weather widget to render');
}

