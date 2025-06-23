const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

function getYoutubeGif(track, artist) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const query = encodeURIComponent(`${track} ${artist} official music video`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&key=${apiKey}&type=video&maxResults=1`;

    console.log("Querying YouTube API with URL:", url);

    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          console.log("YouTube API response:", data);
          const json = JSON.parse(data);
          const videoId = json.items?.[0]?.id?.videoId;
          if (!videoId) {
            console.warn("No videoId found in API response");
            return resolve(null);
          }

          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const outName = `yt_${Date.now()}`;
          const mp4Path = path.join(__dirname, `${outName}.mp4`);
          const gifPath = path.join(__dirname, `${outName}.gif`);

          execSync(`python3 -m yt_dlp -f mp4 -o "${mp4Path}" "${videoUrl}"`);
          execSync(`ffmpeg -ss 00:00:30 -i "${mp4Path}" -t 00:00:08 -vf "scale=300:-1,fps=15" -loop 0 "${gifPath}"`);
          fs.unlinkSync(mp4Path);
          resolve(gifPath);
        } catch (err) {
          console.error("Error parsing response or downloading/processing video:", err);
          resolve(null);
        }
      });
    }).on('error', err => {
      console.error("YouTube API request failed:", err);
      reject(err);
    });
  });
}

module.exports = { getYoutubeGif };
