const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const TEMP = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP)) fs.mkdirSync(TEMP);

app.get('/get-canvas-gif', async (req, res) => {
  const trackUrl = req.query.track;
  if (!trackUrl || !trackUrl.includes('open.spotify.com/track/')) 
    return res.status(400).json({ error: 'Invalid track URL' });
  const id = trackUrl.split('track/')[1].split('?')[0];
  const url = `https://www.canvasdownloader.com/canvas?link=${encodeURIComponent(trackUrl)}`;

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    let mp4Url = null;
    page.on('request', req => {
      const u = req.url();
      if (u.endsWith('.mp4') && u.includes('canvaz')) mp4Url = u;
    });

    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('a[href$=".mp4"]', { timeout: 15000 });
    await page.click('a[href$=".mp4"]');
    await page.waitForTimeout(5000);
    await browser.close();

    if (!mp4Url) return res.status(500).json({ error: 'Canvas URL not found' });

    const mp4Path = path.join(TEMP, `${id}.mp4`);
    const gifPath = path.join(TEMP, `${id}.gif`);
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(mp4Path);
      https.get(mp4Url, r => { r.pipe(file); file.on('finish', () => file.close(resolve)); })
        .on('error', reject);
    });

    await new Promise((resolve, reject) => {
      const ff = spawn(require('ffmpeg-static'), ['-i', mp4Path, '-vf', 'fps=15,scale=300:-1', '-loop', '0', gifPath]);
      ff.on('close', code => code === 0 ? resolve() : reject('ffmpeg error ' + code));
    });

    fs.unlinkSync(mp4Path);
    res.json({ gif_url: `${req.protocol}://${req.get('host')}/gif/${id}.gif` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error processing canvas' });
  }
});

app.use('/gif', express.static(TEMP, { maxAge: '1h' }));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
