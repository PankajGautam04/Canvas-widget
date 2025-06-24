// server.js - YouTube Screen Recording Only

const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { execSync } = require('child_process');
const https = require('https');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'your_actual_key_here';

function cleanUpFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// YouTube fallback logic with Puppeteer screen recording
async function recordYouTubeToGif(query, res) {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1`;

  https.get(searchUrl, response => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', async () => {
      try {
        const json = JSON.parse(data);
        const videoId = json.items?.[0]?.id?.videoId;
        if (!videoId) return res.status(404).json({ error: 'No video found' });

        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const timestamp = Date.now();
        const outputWebm = path.join(__dirname, `record_${timestamp}.webm`);
        const outputGif = path.join(__dirname, `hook_${timestamp}.gif`);

        const client = await page.target().createCDPSession();
        await client.send('Page.startScreencast', { format: 'jpeg', quality: 100, everyNthFrame: 1 });

        const frames = [];
        client.on('Page.screencastFrame', async ({ data, sessionId }) => {
          frames.push(Buffer.from(data.split(',')[1], 'base64'));
          await client.send('Page.screencastFrameAck', { sessionId });
        });

        await page.goto(videoUrl, { waitUntil: 'networkidle2' });
        await page.waitForTimeout(8000);
        await client.send('Page.stopScreencast');

        await browser.close();

        const mjpegPath = path.join(__dirname, `frames_${timestamp}.mjpeg`);
        fs.writeFileSync(mjpegPath, Buffer.concat(frames));

        ffmpeg(mjpegPath)
          .outputOptions('-vf', 'fps=10,scale=320:-1:flags=lanczos')
          .duration(8)
          .save(outputGif)
          .on('end', () => {
            res.sendFile(outputGif);
            setTimeout(() => {
              cleanUpFile(outputGif);
              cleanUpFile(mjpegPath);
            }, 60000);
          })
          .on('error', err => {
            console.error('GIF conversion failed:', err);
            res.status(500).json({ error: 'Failed to convert to GIF' });
          });
      } catch (err) {
        console.error('YouTube API or recording error:', err);
        res.status(500).json({ error: err.message });
      }
    });
  }).on('error', err => {
    res.status(500).json({ error: 'YouTube API request failed: ' + err.message });
  });
}

app.post('/extract-canvas', async (req, res) => {
  const { trackUrl } = req.body;
  if (!trackUrl || !trackUrl.includes('open.spotify.com/track')) {
    return res.status(400).json({ error: 'Invalid Spotify track URL' });
  }
  const trackId = trackUrl.split('/').pop().split('?')[0];
  const query = `official music video ${trackId}`;
  recordYouTubeToGif(query, res);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
