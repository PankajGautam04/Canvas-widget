const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ytdlp = require('yt-dlp-exec').raw;
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const app = express();
app.use(express.json());

// ✅ Proxies that support YouTube downloads
const proxies = [
  'http://138.201.5.68:3128',
  'http://190.61.88.147:8080',
  'http://45.167.124.33:999',
  'http://47.252.29.28:11222' // Your proxy
];

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

async function downloadAndConvertToGif(videoUrl) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytgif-'));
  const videoPath = path.join(tempDir, 'video.mp4');
  const gifPath = path.join(tempDir, 'hook.gif');

  const shuffledProxies = shuffle([...proxies]);
  let success = false;
  let lastError = null;

  for (const proxy of shuffledProxies) {
    console.log(`🔌 Trying proxy: ${proxy}`);

    try {
      await new Promise((resolve, reject) => {
        const ytdlpProcess = ytdlp([
          videoUrl,
          '-f', 'mp4',
          '-o', videoPath,
          '--proxy', proxy
        ]);

        ytdlpProcess.on('close', (code) => {
          if (code !== 0 || !fs.existsSync(videoPath)) {
            return reject(new Error('yt-dlp failed or video not downloaded.'));
          }
          resolve();
        });
      });

      // If download was successful, convert to GIF
      await new Promise((resolve, reject) => {
        execFile(ffmpegPath, [
          '-ss', '00:00:20',
          '-t', '8',
          '-i', videoPath,
          '-vf', 'fps=12,scale=320:-1:flags=lanczos',
          '-y',
          gifPath
        ], (err) => {
          if (err || !fs.existsSync(gifPath)) {
            return reject(new Error('FFmpeg conversion failed.'));
          }
          resolve();
        });
      });

      const buffer = fs.readFileSync(gifPath);
      fs.rmSync(tempDir, { recursive: true, force: true });
      return buffer;

    } catch (err) {
      console.error(`❌ Proxy failed (${proxy}):`, err.message);
      lastError = err;
      // Clean up video file in case of partial/incomplete downloads
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    }
  }

  // Clean up tempDir even if all proxies fail
  fs.rmSync(tempDir, { recursive: true, force: true });
  throw lastError || new Error('All proxies failed');
}

app.post('/yt-hook', async (req, res) => {
  const { videoUrl } = req.body;

  if (!videoUrl || (!videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be'))) {
    return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
  }

  try {
    const gifBuffer = await downloadAndConvertToGif(videoUrl);
    res.setHeader('Content-Type', 'image/gif');
    res.send(gifBuffer);
  } catch (err) {
    console.error('yt-hook error:', err.message || err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
