// server.js

const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHROME_PATH = path.join(__dirname, 'chromium', 'chrome-linux', 'chrome');

// Clean up temporary files
function cleanUpFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// Search YouTube via API
async function searchYouTubeVideo(query) {
  const https = require('https');
  const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1`;

  return new Promise((resolve, reject) => {
    https.get(apiUrl, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const videoId = json.items?.[0]?.id?.videoId;
          if (videoId) {
            resolve(`https://www.youtube.com/watch?v=${videoId}`);
          } else {
            reject('No video found');
          }
        } catch (err) {
          reject(err.message);
        }
      });
    }).on('error', err => reject(err.message));
  });
}

// Record screen for 8 seconds and convert to GIF
async function recordYouTubeToGif(videoUrl) {
  const timestamp = Date.now();
  const webmPath = path.join(__dirname, `record_${timestamp}.webm`);
  const gifPath = path.join(__dirname, `record_${timestamp}.gif`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,720'
    ],
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = await browser.newPage();

  // Inject recorder script
  await page.goto('about:blank');
  await page.setContent(`
    <html>
    <body style="margin:0;overflow:hidden;">
      <video id="yt" width="1280" height="720" autoplay muted playsinline></video>
      <script>
        const url = "${videoUrl}";
        const video = document.getElementById("yt");
        video.src = url.replace("watch?v=", "embed/") + "?autoplay=1&mute=1";
        video.play();
      </script>
    </body>
    </html>
  `);

  const client = await page.target().createCDPSession();
  await client.send('Page.startScreencast', { format: 'webm', quality: 100 });

  const chunks = [];

  client.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    chunks.push(Buffer.from(data, 'base64'));
    await client.send('Page.screencastFrameAck', { sessionId });
  });

  await page.waitForTimeout(8000);

  await client.send('Page.stopScreencast');
  await browser.close();

  // Save WebM
  fs.writeFileSync(webmPath, Buffer.concat(chunks));

  // Convert to GIF
  return new Promise((resolve, reject) => {
    ffmpeg(webmPath)
      .outputOptions('-vf', 'fps=10,scale=320:-1:flags=lanczos')
      .duration(8)
      .save(gifPath)
      .on('end', () => {
        cleanUpFile(webmPath);
        resolve(gifPath);
      })
      .on('error', err => reject(err));
  });
}

// Main API
app.post('/yt-hook', async (req, res) => {
  const { title, artist } = req.body;

  if (!title || !artist) {
    return res.status(400).json({ error: 'Missing title or artist' });
  }

  try {
    const query = `official music video ${title} ${artist}`;
    const videoUrl = await searchYouTubeVideo(query);
    const gifPath = await recordYouTubeToGif(videoUrl);
    const base64 = fs.readFileSync(gifPath, { encoding: 'base64' });
    cleanUpFile(gifPath);
    res.json({ type: 'gif', base64 });
  } catch (err) {
    console.error('yt-hook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Debug route
app.get('/debug', (req, res) => {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.gif'));
  if (files.length === 0) return res.status(404).send('No debug files found.');
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <h2>Generated GIFs</h2>
    ${files.map(f => `<div><p>${f}</p><img src="/${f}" width="300"/></div>`).join('')}
  `);
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
