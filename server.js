const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHROME_PATH = path.join(__dirname, 'chromium', 'chrome-linux', 'chrome');

// 🔍 Search YouTube for video
async function searchYouTubeVideo(query) {
  console.log(`🔍 Searching YouTube for: ${query}`);
  const https = require('https');
  const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
    query
  )}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1`;

  return new Promise((resolve, reject) => {
    https
      .get(apiUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const videoId = json.items?.[0]?.id?.videoId;
            if (videoId) {
              const url = `https://www.youtube.com/watch?v=${videoId}`;
              console.log(`✅ Found video: ${url}`);
              resolve(url);
            } else {
              reject('No video found');
            }
          } catch (err) {
            reject('Failed to parse YouTube response: ' + err.message);
          }
        });
      })
      .on('error', (err) => reject('YouTube API error: ' + err.message));
  });
}

// 📸 Capture YouTube video as GIF
async function recordGifBuffer(videoUrl) {
  console.log('🚀 Launching browser for:', videoUrl);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,720',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
    ],
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log('📺 Opening YouTube watch page...');
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });

  console.log('⏳ Waiting 7 seconds to let video load...');
  await page.waitForTimeout(7000);

  console.log('🎞️ Capturing 192 frames at 24 fps...');
  const frames = [];
  for (let i = 0; i < 192; i++) {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
    frames.push(buffer);
    await page.waitForTimeout(1000 / 24);
  }

  await browser.close();
  console.log('✅ Captured all frames. Converting to GIF...');

  return new Promise((resolve, reject) => {
    const inputStream = new PassThrough();

    const ffmpegProc = ffmpeg(inputStream)
      .inputFormat('image2pipe')
      .outputOptions('-vf', 'fps=24,scale=320:-1:flags=lanczos')
      .format('gif')
      .on('error', (err) => {
        console.error('❌ FFmpeg error:', err.message);
        reject(err);
      });

    const outputChunks = [];
    const outputStream = new PassThrough();

    ffmpegProc.pipe(outputStream);

    outputStream.on('data', (chunk) => outputChunks.push(chunk));
    outputStream.on('end', () => {
      console.log('🎉 GIF created in memory');
      resolve(Buffer.concat(outputChunks));
    });

    for (const frame of frames) {
      inputStream.write(frame);
    }
    inputStream.end();
  });
}

// 🎯 Main API endpoint
app.post('/yt-hook', async (req, res) => {
  const { title, artist } = req.body;

  if (!title || !artist) {
    console.log('❌ Missing title or artist');
    return res.status(400).json({ error: 'Missing title or artist' });
  }

  try {
    const query = `official music video ${title} ${artist}`;
    const videoUrl = await searchYouTubeVideo(query);
    const gifBuffer = await recordGifBuffer(videoUrl);

    res.setHeader('Content-Type', 'image/gif');
    res.send(gifBuffer);
  } catch (err) {
    console.error('yt-hook error:', err.message || err);
    res.status(500).json({ error: err.message || err });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
