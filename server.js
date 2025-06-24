const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const os = require('os');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHROME_PATH = path.join(__dirname, 'chromium', 'chrome-linux', 'chrome');

function cleanUpFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// Search YouTube
async function searchYouTubeVideo(query) {
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
              resolve(`https://www.youtube.com/watch?v=${videoId}`);
            } else {
              reject('No video found');
            }
          } catch (err) {
            reject(err.message);
          }
        });
      })
      .on('error', (err) => reject(err.message));
  });
}

// Record YouTube video as GIF (24 FPS)
async function recordYouTubeToGif(videoUrl) {
  const timestamp = Date.now();
  const tmpDir = os.tmpdir();
  const gifPath = path.join(tmpDir, `yt_${timestamp}.gif`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,720',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--hide-scrollbars'
    ],
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = await browser.newPage();
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });

  // Start playback
  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video) {
      video.muted = true;
      video.play();
    }
  });

  await page.waitForTimeout(3000); // allow video to buffer

  // Capture screenshots for 8 seconds at 24 fps
  const frames = [];
  for (let i = 0; i < 8 * 24; i++) {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
    frames.push(buffer);
    await page.waitForTimeout(1000 / 24);
  }

  await browser.close();

  // Convert frames to GIF using ffmpeg
  return new Promise((resolve, reject) => {
    const ffmpegCmd = ffmpeg()
      .input(`pipe:0`)
      .inputFormat('image2pipe')
      .outputOptions('-vf', 'fps=24,scale=320:-1:flags=lanczos')
      .toFormat('gif')
      .on('end', () => {
        resolve(gifPath);
      })
      .on('error', reject)
      .save(gifPath);

    for (const frame of frames) {
      ffmpegCmd.stdin.write(frame);
    }
    ffmpegCmd.stdin.end();
  }).then(() => gifPath);
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

// Optional: view generated GIFs
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
