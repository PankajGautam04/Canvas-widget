const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ytdlp = require('youtube-dl-exec').raw;
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Rotate through multiple working proxies
const proxies = [
  'http://185.246.85.105:80',
  'http://47.252.29.28:11222',
  'http://103.170.22.167:8080' // Add more if needed
];

function getProxyArgs() {
  const proxy = proxies[Math.floor(Math.random() * proxies.length)];
  return ['--proxy', proxy];
}

async function searchYouTubeVideo(title, artist) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const q = encodeURIComponent(`${title} ${artist}`);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${q}&key=${apiKey}`;

  const res = await axios.get(url);
  const items = res.data.items;
  if (items.length === 0) throw new Error('No video found');

  return `https://www.youtube.com/watch?v=${items[0].id.videoId}`;
}

async function downloadAndConvertToGif(videoUrl) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytgif-'));
    const videoPath = path.join(tempDir, 'video.mp4');
    const gifPath = path.join(tempDir, 'hook.gif');

    const args = [
      videoUrl,
      '-f', 'mp4',
      '-o', videoPath,
      ...getProxyArgs()
    ];

    const ytdlpProcess = ytdlp(args);

    ytdlpProcess.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(videoPath)) {
        return reject(new Error('yt-dlp failed or video not downloaded.'));
      }

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

app.post('/yt-hook', async (req, res) => {
  const { title, artist } = req.body;

  if (!title || !artist) {
    return res.status(400).json({ error: 'Missing title or artist' });
  }

  try {
    const videoUrl = await searchYouTubeVideo(title, artist);
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
