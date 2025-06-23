const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

app.post('/extract-canvas', async (req, res) => {
  const { trackUrl } = req.body;
  if (!trackUrl || !trackUrl.startsWith('https://open.spotify.com/track/')) {
    return res.status(400).json({ error: 'Invalid Spotify track URL' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-default-apps',
        '--mute-audio',
        '--no-first-run',
        '--no-zygote'
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    );
    await page.setViewport({ width: 375, height: 667, isMobile: true });

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if ([
        'image',
        'stylesheet',
        'font',
        'media',
        'other',
        'script'
      ].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(`https://www.canvasdownloader.com/canvas?link=${trackUrl}`, {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('video', { timeout: 10000 });
    const videoSrc = await page.$eval('video', el => el.src);

    await browser.close();
    res.json({ videoUrl: videoSrc });
  } catch (err) {
    if (browser) await browser.close();
    console.error(err);
    res.status(500).json({ error: 'Failed to extract canvas' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
