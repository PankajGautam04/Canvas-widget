// server.js
const express = require('express');
const puppeteer = require('puppeteer-core');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ytHook = require('./yt-hook');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

app.post('/extract-canvas', async (req, res) => {
  const { trackUrl } = req.body;
  if (!trackUrl || !trackUrl.includes('spotify.com/track/')) {
    return res.status(400).json({ error: 'Invalid Spotify track URL' });
  }

  try {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    });

    const page = await browser.newPage();
    const encoded = encodeURIComponent(trackUrl);
    const targetUrl = `https://www.canvasdownloader.com/canvas?link=${encoded}`;

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const downloadLink = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/downloads/"]');
      return a ? a.href : null;
    });

    await browser.close();

    if (!downloadLink) {
      return res.status(500).json({ error: 'Canvas not found' });
    }

    res.json({ gifUrl: downloadLink });
  } catch (err) {
    console.error('Canvas extraction failed, falling back to YouTube:', err.message);
    ytHook(req, res); // fallback to YouTube video hook
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
