// server.js
const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-core');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

const ytHook = require('./yt-hook');

app.use(bodyParser.json());

app.post('/extract-canvas', async (req, res) => {
  const { trackUrl } = req.body;

  if (!trackUrl || !trackUrl.includes('open.spotify.com/track/')) {
    return res.status(400).json({ error: 'Invalid Spotify track URL' });
  }

  try {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`https://www.canvasdownloader.com/canvas?link=${trackUrl}`, { waitUntil: 'networkidle2' });

    // Wait for download button to appear
    await page.waitForSelector('a[href^="/downloads/"]', { timeout: 5000 });
    const gifUrl = await page.$eval('a[href^="/downloads/"]', a => a.href);

    await browser.close();

    return res.json({ gifUrl });
  } catch (err) {
    console.error('Canvas extraction failed, falling back to YouTube:', err.message);
    ytHook(req, res); // fallback
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
