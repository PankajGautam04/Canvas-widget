// server.js

const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const stream = require('stream');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHROME_PATH = path.join(__dirname, 'chromium', 'chrome-linux', 'chrome');

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

// Record screen for 8 seconds and convert to GIF (24fps, no file saves)
async function recordYouTubeToGif(videoUrl) {
  const puppeteer = require('puppeteer-extra');
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

  const totalFrames = 24 * 8;
  const frames = [];

  for (let i = 0; i < totalFrames; i++) {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
    frames.push(buffer);
    await page.waitForTimeout(1000 / 24);
  }

  await browser.close();

  // Create FFmpeg pipeline to convert frames to GIF
  return new Promise((resolve, reject) => {
    const input = new stream.PassThrough();
    const output = [];

    const proc = ffmpeg(input)
      .inputFormat('image2pipe')
      .inputOptions('-framerate 24')
      .outputOptions([
        '-vf', 'fps=24,scale=320:-1:flags=lanczos',
        '-loop', '0'
      ])
      .format('gif')
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(output)))
      .pipe();

    proc.on('data', chunk => output.push(chunk));
    for (const frame of frames) input.write(frame);
    input.end();
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
    const gifBuffer = await recordYouTubeToGif(videoUrl);
    res.setHeader('Content-Type', 'image/gif');
    res.send(gifBuffer);
  } catch (err) {
    console.error('yt-hook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Debug route
app.get('/debug', (req, res) => {
  res.send('<h2>GIFs are returned directly via POST /yt-hook</h2>');
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
