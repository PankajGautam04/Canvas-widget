const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ytdlp = require('youtube-dl-exec'); // ✅ FIXED: no .raw
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// ✅ Proxy list to avoid rate-limiting
const proxies = [
  'http://185.246.85.105:80',
  'http://47.252.29.28:11222',
  'http://103.170.22.167:8080'
];

function getRandomProxyArgs() {
  const proxy = proxies[Math.floor(Math.random() * proxies.length)];
  console.log('➡️ Using proxy:', proxy);
  return ['--proxy', proxy];
}

// ✅ Search YouTube Data API v3 for video
async function searchYouTubeVideo(title, artist) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const query = encodeURIComponent(`${title} ${artist}`);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${query}&key=${apiKey}`;

  const response = await axios.get(url);
  const items = response.data.items;
  if (!items.length) throw new Error('No video found');

  return `https://www.youtube.com/watch?v=${items[0].id.videoId}`;
}

// ✅ Download + Convert to 8s GIF
async function downloadAndConvertToGif(videoUrl) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytgif-'));
    const videoPath = path.join(tempDir, 'video.mp4');
    const gifPath = path.join(tempDir, 'hook.gif');

    const args = [
      videoUrl,
      '-f', 'mp4',
      '-o', videoPath,
      ...getRandomProxyArgs()
    ];

    console.log('⬇️ Running yt-dlp...');
    const ytdlpProcess = ytdlp(args);

    ytdlpProcess.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(videoPath)) {
        return reject(new Error('yt-dlp failed or video not downloaded.'));
      }

      console.log('🎬 Converting to GIF...');
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

        const buffer = fs.readFileSync(gifPath);
        fs.rmSync(tempDir, { recursive: true, force: true });
        resolve(buffer);
      });
    });
  });
}

// ✅ Main endpoint
app.post('/yt-hook', async (req, res) => {
  const { title, artist } = req.body;

  if (!title || !artist) {
    return res.status(400).json({ error: 'Missing title or artist' });
  }

  try {
    const videoUrl = await searchYouTubeVideo(title, artist);
    console.log('🔗 Found video:', videoUrl);
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
