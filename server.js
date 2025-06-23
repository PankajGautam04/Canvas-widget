// File: server.js

const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const https = require('https');
const ffmpeg = require('fluent-ffmpeg');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const SPOTIFY_EMAIL = process.env.SPOTIFY_EMAIL;
const SPOTIFY_PASSWORD = process.env.SPOTIFY_PASSWORD;

function cleanUpFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

async function extractCanvasMp4(trackUrl) {
  const browser = await puppeteer.launch({
    executablePath: path.join(__dirname, 'chromium', 'chrome-linux', 'chrome'),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const canvasUrls = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('.mp4') && url.includes('canvas')) {
      canvasUrls.push(url);
    }
  });

  await page.goto('https://accounts.spotify.com/en/login', { waitUntil: 'networkidle2' });
  await page.type('#login-username', SPOTIFY_EMAIL);
  await page.type('#login-password', SPOTIFY_PASSWORD);
  await Promise.all([
    page.click('#login-button'),
    page.waitForNavigation({ waitUntil: 'networkidle2' })
  ]);

  await page.goto(trackUrl, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(8000);

  await browser.close();
  if (canvasUrls.length === 0) throw new Error('Canvas MP4 not found');
  return canvasUrls[0];
}

app.post('/extract-canvas', async (req, res) => {
  const { trackUrl } = req.body;
  if (!trackUrl || !trackUrl.includes('open.spotify.com/track')) {
    return res.status(400).json({ error: 'Invalid Spotify track URL' });
  }

  try {
    const canvasUrl = await extractCanvasMp4(trackUrl);
    res.json({ type: 'canvas', url: canvasUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to extract Canvas: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
