const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
app.use(bodyParser.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'your_actual_key_here';

function cleanUpFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// --------- Spotify Canvas Extraction with Puppeteer ---------
async function extractSpotifyCanvas(trackUrl) {
  const browser = await puppeteer.launch({
    executablePath: path.join(__dirname, 'chromium', 'chrome-linux', 'chrome'), // ✅ LOCAL CHROMIUM
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto(`https://www.canvasdownloader.com/canvas?link=${trackUrl}`, {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  await page.waitForSelector('a[download]', { timeout: 10000 }).catch(() => null);
  const downloadLink = await page.$eval('a[download]', el => el.href).catch(() => null);

  await browser.close();

  if (!downloadLink) {
    throw new Error('Canvas download link not found');
  }

  return downloadLink;
}

// --------- YouTube Fallback Logic ---------
function searchYouTube(query, callback) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1`;

  https.get(url, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const videoId = json.items[0]?.id?.videoId;
        if (videoId) {
          callback(null, videoId);
        } else {
          callback('No video found');
        }
      } catch (err) {
        callback('Failed to parse YouTube response');
      }
    });
  }).on('error', err => {
    callback(err.message);
  });
}

function downloadYouTubeVideo(videoId, callback) {
  const fileName = `yt_${Date.now()}.mp4`;
  const filePath = path.join(__dirname, fileName);
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    execSync(`python3 -m yt_dlp -f mp4 -o "${filePath}" "${ytUrl}"`, { stdio: 'inherit' });
    callback(null, filePath);
  } catch (err) {
    callback(err.message);
  }
}

function convertToGif(inputPath, outputPath, callback) {
  ffmpeg(inputPath)
    .setStartTime(30)
    .duration(5)
    .outputOptions('-vf', 'fps=10,scale=320:-1:flags=lanczos')
    .save(outputPath)
    .on('end', () => callback(null, outputPath))
    .on('error', err => callback(err.message));
}

// --------- Main API ---------
app.post('/extract-canvas', async (req, res) => {
  const trackUrl = req.body.trackUrl;
  if (!trackUrl || !trackUrl.includes('open.spotify.com/track')) {
    return res.status(400).json({ error: 'Invalid Spotify track URL' });
  }

  try {
    // 🟢 Try Canvas
    const canvasUrl = await extractSpotifyCanvas(trackUrl);
    return res.json({ type: 'canvas', url: canvasUrl });
  } catch (err) {
    console.error('Canvas extraction failed, falling back to YouTube:', err.message);

    // 🔁 Fallback to YouTube
    const fallbackQuery = `official music video ${trackUrl.split('/').pop()}`;
    searchYouTube(fallbackQuery, (ytErr, videoId) => {
      if (ytErr) {
        return res.status(500).json({ error: 'YouTube fallback failed: ' + ytErr });
      }

      downloadYouTubeVideo(videoId, (dlErr, videoPath) => {
        if (dlErr) {
          return res.status(500).json({ error: 'Video download failed: ' + dlErr });
        }

        const gifPath = path.join(__dirname, `hook_${Date.now()}.gif`);
        convertToGif(videoPath, gifPath, (gifErr, finalPath) => {
          cleanUpFile(videoPath);
          if (gifErr) {
            return res.status(500).json({ error: 'GIF conversion failed: ' + gifErr });
          }

          const base64Gif = fs.readFileSync(finalPath, { encoding: 'base64' });
          cleanUpFile(finalPath);
          return res.json({ type: 'gif', base64: base64Gif });
        });
      });
    });
  }
});

// --------- Start Server ---------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
