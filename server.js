// File: server.js

const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

// 🔒 Make sure to set these in your .env or Render environment variables
const SPOTIFY_EMAIL = process.env.SPOTIFY_EMAIL || 'your_email_here';
const SPOTIFY_PASSWORD = process.env.SPOTIFY_PASSWORD || 'your_password_here';

function cleanUpFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ---------- Spotify Canvas Extraction ----------
async function extractCanvasMp4(trackUrl) {
  const browser = await puppeteer.launch({
    executablePath: path.join(__dirname, 'chromium', 'chrome-linux', 'chrome'),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const canvasUrls = [];

  // 🎯 Listen for MP4 canvas files
  page.on('request', req => {
    const url = req.url();
    if (url.includes('.mp4') && url.includes('canvas')) {
      canvasUrls.push(url);
    }
  });

  // 🌐 Log into Spotify
  await page.goto('https://accounts.spotify.com/en/login', { waitUntil: 'networkidle2' });
  await page.type('#login-username', SPOTIFY_EMAIL);
  await page.type('#login-password', SPOTIFY_PASSWORD);

  await Promise.all([
    page.click('#login-button'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);

  // 🎵 Open the track URL
  await page.goto(trackUrl, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(8000); // Wait to allow Canvas to load

  // 📸 Optional debug screenshot
  const debugPath = path.join(__dirname, 'debug_canvas.png');
  await page.screenshot({ path: debugPath });

  await browser.close();

  // Delete screenshot after 60s (optional)
  setTimeout(() => cleanUpFile(debugPath), 60000);

  if (canvasUrls.length === 0) {
    throw new Error('Canvas MP4 not found');
  }

  return canvasUrls[0];
}

// ---------- API Route ----------
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
    res.status(500).json({ error: 'Canvas extraction failed: ' + err.message });
  }
});

// ---------- Debug Screenshot Route ----------
app.get('/debug-canvas', (req, res) => {
  const file = path.join(__dirname, 'debug_canvas.png');
  if (!fs.existsSync(file)) return res.status(404).send('No debug screenshot found');
  res.sendFile(file);
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
