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

async function downloadAndConvertToGif(videoUrl) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytgif-'));
    const videoPath = path.join(tempDir, 'video.mp4');
    const gifPath = path.join(tempDir, 'hook.gif');

    // Step 1: Download video with yt-dlp
    const ytdlpProcess = ytdlp([
      videoUrl,
      '-f', 'mp4',
      '-o', videoPath
    ]);

    ytdlpProcess.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(videoPath)) {
        return reject(new Error('yt-dlp failed or video not downloaded.'));
      }

      // Step 2: Convert 8s to GIF using ffmpeg
      execFile(ffmpegPath, [
        '-ss', '00:00:20', // Start at 20 seconds
        '-t', '8',         // Duration of 8 seconds
        '-i', videoPath,
        '-vf', 'fps=12,scale=320:-1:flags=lanczos',
        '-y',
        gifPath
      ], (err) => {
        if (err || !fs.existsSync(gifPath)) {
          return reject(new Error('FFmpeg conversion failed.'));
        }

        // Read GIF and return buffer
        const buffer = fs.readFileSync(gifPath);
        fs.rmSync(tempDir, { recursive: true, force: true });
        resolve(buffer);
      });
    });
  });
}

app.post('/yt-hook', async (req, res) => {
  const { videoUrl } = req.body;

  if (!videoUrl || !videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be')) {
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
