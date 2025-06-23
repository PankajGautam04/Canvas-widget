// yt-hook.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

module.exports = function(req, res) {
  try {
    const { trackUrl } = req.body;
    const query = encodeURIComponent(trackUrl);
    const apiKey = process.env.YOUTUBE_API_KEY;
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}%20official%20music%20video&key=${apiKey}&type=video&maxResults=1`;

    console.log('Querying YouTube API with URL:', apiUrl);

    require('https').get(apiUrl, (response) => {
      let data = '';

      response.on('data', chunk => data += chunk);

      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          const videoId = json.items?.[0]?.id?.videoId;

          if (!videoId) return res.status(404).json({ error: 'No video found' });

          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const outputPath = path.join(__dirname, `yt_${Date.now()}.mp4`);

          console.log('Downloading:', videoUrl);

          execSync(`python3 -m yt_dlp -f mp4 -o "${outputPath}" "${videoUrl}"`, { stdio: 'inherit' });

          const gifPath = outputPath.replace('.mp4', '.gif');
          ffmpeg(outputPath)
            .setStartTime('00:00:30')
            .setDuration(5)
            .outputOptions('-vf', 'fps=10,scale=360:-1:flags=lanczos')
            .loop(0)
            .save(gifPath)
            .on('end', () => {
              fs.unlinkSync(outputPath);
              return res.json({ gifUrl: `/gifs/${path.basename(gifPath)}` });
            });

        } catch (err) {
          console.error('Error parsing response or downloading/processing video:', err);
          res.status(500).json({ error: 'Internal server error' });
        }
      });
    }).on('error', err => {
      console.error('YouTube API request error:', err);
      res.status(500).json({ error: 'Failed to fetch from YouTube API' });
    });
  } catch (err) {
    console.error('ytHook internal error:', err);
    res.status(500).json({ error: 'ytHook execution failed' });
  }
};
