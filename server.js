const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const SP_DC = process.env.SP_DC; // Spotify session cookie

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

  // Inject session cookie
  await page.setCookie({
    name: 'sp_dc',
    value: SP_DC,
    domain: '.spotify.com',
    path: '/',
    httpOnly: true,
    secure: true
  });

  // Listen for MP4 canvas requests
  page.on('request', req => {
    const url = req.url();
    if (url.includes('.mp4') && url.includes('canvas')) {
      canvasUrls.push(url);
    }
  });

  // Visit track
  await page.goto(trackUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'debug_canvas_track.png' });

  await browser.close();

  if (canvasUrls.length === 0) throw new Error('Canvas MP4 not found');
  return canvasUrls[0];
}

// POST /extract-canvas
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

// GET /debug-canvas — View debug screenshot
app.get('/debug-canvas', (req, res) => {
  const files = fs.readdirSync(__dirname).filter(f => f.startsWith('debug_') && f.endsWith('.png'));
  if (files.length === 0) return res.status(404).send('No debug screenshots found.');

  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <h2>Debug Screenshots</h2>
    ${files.map(f => `<div><p>${f}</p><img src="/${f}" width="300"/></div>`).join('')}
  `);
});

app.use(express.static(__dirname)); // serve PNGs

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
