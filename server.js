// File: server.js

const express = require('express');
const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

app.post('/yt-gif', async (req, res) => {
  const { song, artist } = req.body;
  if (!song || !artist) return res.status(400).json({ error: 'Missing song or artist' });

  const searchQuery = `${song} ${artist} official music video`;
  const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1`;

  https.get(apiUrl, (ytRes) => {
    let data = '';
    ytRes.on('data', chunk => data += chunk);
    ytRes.on('end', async () => {
      try {
        const json = JSON.parse(data);
        const videoId = json.items?.[0]?.id?.videoId;
        if (!videoId) return res.status(404).json({ error: 'No video found' });

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const timestamp = Date.now();
        const mp4Path = path.join(__dirname, `recording_${timestamp}.mp4`);
        const gifPath = path.join(__dirname, `recording_${timestamp}.gif`);

        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(videoUrl, { waitUntil: 'networkidle2' });

        const recorder = new PuppeteerScreenRecorder(page);
        await recorder.start(mp4Path);
        await page.waitForTimeout(8000); // record for 8s
        await recorder.stop();
        await browser.close();

        execSync(`ffmpeg -y -i "${mp4Path}" -vf "fps=10,scale=320:-1:flags=lanczos" -t 8 "${gifPath}"`);

        res.sendFile(gifPath, {}, () => {
          setTimeout(() => {
            fs.unlink(mp4Path, () => {});
            fs.unlink(gifPath, () => {});
          }, 60000);
        });
      } catch (err) {
        console.error('YT processing error:', err);
        res.status(500).json({ error: 'Failed to process YouTube video' });
      }
    });
  }).on('error', err => {
    console.error('YouTube API error:', err);
    res.status(500).json({ error: 'Failed to query YouTube API' });
  });
});

// Debug preview of latest 5 GIFs
app.get('/debug', (req, res) => {
  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.gif'))
    .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime)
    .slice(0, 5);

  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <h2>Debug GIF Preview</h2>
    ${files.map(f => `<div><p>${f}</p><img src="/${f}" width="300" /></div>`).join('')}
  `);
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
