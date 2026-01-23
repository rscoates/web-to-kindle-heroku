const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');
const execFile = require('child_process').execFile;
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// Cache management
let cachedScreenshot = null;
let cacheMinute = null;
let pendingScreenshot = null;

function getCurrentMinute() {
  const now = new Date();
  return now.getFullYear() * 525600 + 
         now.getMonth() * 44640 + 
         now.getDate() * 1440 + 
         now.getHours() * 60 + 
         now.getMinutes();
}

function isCacheValid() {
  return cachedScreenshot && cacheMinute === getCurrentMinute();
}

async function waitForWidget(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const handle = await page.waitForSelector(
        'iframe[src*="weatherwidget"], iframe[src*="forecast7.com"]',
        { timeout: Math.min(5000, deadline - Date.now()) }
      );

      const frame = await handle.contentFrame();
      if (!frame) continue;

      await frame.waitForSelector('.currentWeatherIcon', {
        visible: true,
        timeout: Math.min(5000, deadline - Date.now()),
      });

      return;
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('frame got detached') || msg.includes('Execution context was destroyed')) {
        continue;
      }
      throw e;
    }
  }

  throw new Error('Timed out waiting for weather widget to render');
}

function convert(filename) {
  return new Promise((resolve, reject) => {
    const args = [filename, '-gravity', 'center', '-extent', '600x800', '-colorspace', 'gray', '-depth', '8', filename];
    execFile('convert', args, (error, stdout, stderr) => {
      if (error) {
        console.error({ error, stdout, stderr });
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function generateScreenshot() {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      executablePath: '/usr/bin/chromium', 
      args: ['--no-sandbox'] 
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 800 });

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

    return fs.readFileSync('/tmp/screenshot.png');
  } finally {
    if (browser) await browser.close();
  }
}

express()
  .use(express.static(path.join(__dirname, 'public')))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/', async (req, res) => {
    try {
      if (isCacheValid()) {
        console.log('Serving from cache');
        res.writeHead(200, { 
          'Content-Type': 'image/png', 
          'Content-Length': cachedScreenshot.length 
        });
        return res.end(cachedScreenshot);
      }

      // Check if a screenshot generation is already in progress
      if (pendingScreenshot) {
        console.log('Waiting for in-progress screenshot generation');
        const screenshot = await pendingScreenshot;
        res.writeHead(200, { 
          'Content-Type': 'image/png', 
          'Content-Length': screenshot.length 
        });
        return res.end(screenshot);
      }

      // Start new screenshot generation
      console.log('Generating new screenshot');
      pendingScreenshot = generateScreenshot()
        .then(screenshot => {
          cachedScreenshot = screenshot;
          cacheMinute = getCurrentMinute();
          pendingScreenshot = null;
          return screenshot;
        })
        .catch(err => {
          pendingScreenshot = null;
          throw err;
        });

      const screenshot = await pendingScreenshot;
      res.writeHead(200, { 
        'Content-Type': 'image/png', 
        'Content-Length': screenshot.length 
      });
      return res.end(screenshot);
    } catch (err) {
      console.error(err);
      res.status(500).send('Screenshot failed');
    }
  })
  .listen(PORT, () => console.log(`Listening on ${PORT}`));
