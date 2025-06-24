const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpegPath = require('ffmpeg-static');
const ytdlp = require('youtube-dl-exec');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// 🔁 Fetch free proxies from Spys.one
async function getSpysProxies(limit = 10) {
  try {
    const res = await axios.get('http://spys.me/proxy.txt');
    const matches = res.data.match(/\b\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}\b/g);
    return matches
      .slice(0, limit)
      .map(ip => `http://${ip}`);
  } catch (err) {
    console.error('❌ Failed to fetch proxies from Spys.one:', err.message);
    return [];
  }
}

// 🔍 Search YouTube for top video
async function searchYouTubeVideo(title, artist) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const query = encodeURIComponent(`${title} ${artist}`);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${query}&key=${apiKey}`;
  const res = await axios.get(url);
  const items = res.data.items;
  if (!items.length) throw new Error('No video found');
  return `https://www.youtube.com/watch?v=${items[0].id.videoId}`;
}

// 🎞️ Download & Convert to GIF
async function downloadAndConvertToGif(videoUrl) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytgif-'));
  const videoPath = path.join(tempDir, 'video.mp4');
  const gifPath = path.join(tempDir, 'hook.gif');

  const proxies = await getSpysProxies(10);
  if (!proxies.length) throw new Error('No proxies available from Spys.one');

  for (const proxy of proxies) {
    console.log(`🔁 Trying proxy: ${proxy}`);

    const args = [
      videoUrl,
      '-f', 'mp4',
      '-o', videoPath,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      '--proxy', proxy,
      '--no-check-certificate',
      '--geo-bypass',
      '--force-ipv4'
    ];

    try {
      await ytdlp(args);
      if (!fs.existsSync(videoPath)) throw new Error('yt-dlp finished but video not downloaded.');

      console.log('🎞️ Download complete. Converting to GIF...');
      await new Promise((resolve, reject) => {
        execFile(ffmpegPath, [
          '-ss', '00:00:20',
          '-t', '8',
          '-i', videoPath,
          '-vf', 'fps=12,scale=320:-1:flags=lanczos',
          '-y',
          gifPath
        ], (err) => {
          if (err || !fs.existsSync(gifPath)) return reject(new Error('FFmpeg conversion failed'));
          resolve();
        });
      });

      const buffer = fs.readFileSync(gifPath);
      fs.rmSync(tempDir, { recursive: true, force: true });
      return buffer;

    } catch (err) {
      console.error(`❌ Proxy failed (${proxy}):`, err.message);
    }
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  throw new Error(`All proxies failed from Spys.one`);
}

// 🧠 Main API
app.post('/yt-hook', async (req, res) => {
  const { title, artist } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'Missing title or artist' });

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

// 🚀 Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
