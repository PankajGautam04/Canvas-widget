const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

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
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    userDataDir: path.join(__dirname, 'puppeteer_profile') // persistent login
  });

  const page = await browser.newPage();
  const canvasUrls = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('.mp4') && url.includes('canvas')) {
      canvasUrls.push(url);
    }
  });

  // Go to Spotify login
  await page.goto('https://accounts.spotify.com/en/login', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: 'debug_1_login_page.png' });

  // Enter email
  await page.waitForSelector('#login-username', { timeout: 15000 });
  await page.type('#login-username', SPOTIFY_EMAIL);
  await page.screenshot({ path: 'debug_2_email_entered.png' });

  // Click “Continue” using XPath
  const [continueBtn] = await page.$x("//span[text()='Continue']/ancestor::button");
  if (continueBtn) {
    await continueBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'debug_3_continue_clicked.png' });
  } else {
    throw new Error('Continue button not found');
  }

  // Click "Log in with a password"
  await page.waitForSelector('button[data-testid="login-with-password"]', { timeout: 10000 });
  await page.click('button[data-testid="login-with-password"]');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'debug_4_password_option.png' });

  // Enter password
  await page.waitForSelector('#login-password', { timeout: 10000 });
  await page.type('#login-password', SPOTIFY_PASSWORD);
  await page.screenshot({ path: 'debug_5_password_entered.png' });

  // Click Login
  await Promise.all([
    page.click('#login-button'),
    page.waitForNavigation({ waitUntil: 'networkidle2' })
  ]);
  await page.screenshot({ path: 'debug_6_logged_in.png' });

  // Go to track
  await page.goto(trackUrl, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'debug_7_track_page.png' });

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

// Debug screenshot viewer
app.get('/debug-canvas', (req, res) => {
  const shots = fs.readdirSync(__dirname).filter(f => f.startsWith('debug_') && f.endsWith('.png'));
  if (shots.length === 0) return res.status(404).send('No debug screenshots found.');

  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <h2>Debug Screenshots</h2>
    ${shots.map(f => `<div><p>${f}</p><img src="/${f}" width="300"/></div>`).join('')}
  `);
});

app.use(express.static(__dirname)); // serve PNGs

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
