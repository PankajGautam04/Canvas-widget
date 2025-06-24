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

function cleanUpFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// 🧠 Search YouTube using API
async function searchYouTubeVideo(query) {
  console.log(`🔍 Searching YouTube for: ${query}`);
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
    }).on('error', err => reject('YouTube API error: ' + err.message));
  });
}

// 🎥 Record and convert to GIF
async function recordYouTubeToGif(videoUrl) {
  const timestamp = Date.now();
  const gifPath = path.join(__dirname, `yt_${timestamp}.gif`);
  console.log('🚀 Launching browser for:', videoUrl);

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

  console.log('📺 Loading video player...');
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

  console.log('🎞️ Capturing 192 frames at 24 fps...');
  const frames = [];
  for (let i = 0; i < 192; i++) { // 8s * 24fps
    const buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
    frames.push(buffer);
    await page.waitForTimeout(1000 / 24);
  }

  await browser.close();
  console.log('✅ Captured all frames. Converting to GIF...');

  return new Promise((resolve, reject) => {
    const proc = ffmpeg()
      .input('pipe:0')
      .inputFormat('image2pipe')
      .outputOptions([
        '-vf', 'fps=24,scale=320:-1:flags=lanczos'
      ])
      .format('gif')
      .on('end', () => {
        console.log('🎉 GIF conversion complete.');
        resolve(gifPath);
      })
      .on('error', (err) => {
        console.error('❌ FFmpeg error:', err.message);
        reject(err);
      });

    const writeStream = fs.createWriteStream(gifPath);
    proc.pipe(writeStream);

    for (const frame of frames) {
      proc.stdin.write(frame);
    }

    proc.stdin.end();
  });
}

// 🧠 Main API
app.post('/yt-hook', async (req, res) => {
  const { title, artist } = req.body;

  if (!title || !artist) {
    console.log('❌ Missing title or artist');
    return res.status(400).json({ error: 'Missing title or artist' });
  }

  try {
    const query = `official music video ${title} ${artist}`;
    const videoUrl = await searchYouTubeVideo(query);
    const gifPath = await recordYouTubeToGif(videoUrl);

    res.setHeader('Content-Type', 'image/gif');
    res.sendFile(gifPath, (err) => {
      if (!err) {
        cleanUpFile(gifPath);
        console.log('🧹 Cleaned up temporary GIF:', gifPath);
      } else {
        console.error('❌ Error sending file:', err.message);
      }
    });
  } catch (err) {
    console.error('yt-hook error:', err.message || err);
    res.status(500).json({ error: err.message || err });
  }
});

// 🧪 Debug route to view GIFs
app.get('/debug', (req, res) => {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.gif'));
  if (files.length === 0) return res.status(404).send('No debug GIFs found');
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
