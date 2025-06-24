// server.js
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const ytdlp = require('yt-dlp-exec');
const app = express();
app.use(express.json());
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
// 🛡️ Proxy list
const PROXIES = [
'http://154.236.191.131:1976',
'http://154.236.191.61:1976',
'http://154.236.177.188:1976'
];
function getRandomProxy() {
return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}
async function searchYouTubeVideo(query) {
console.log(Searching YouTube for: ${query});
const https = require('https');
const apiUrl = https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent( query )}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1;
return new Promise((resolve, reject) => {
https
.get(apiUrl, (res) => {
let data = '';
res.on('data', (chunk) => (data += chunk));
res.on('end', () => {
try {
const json = JSON.parse(data);
const videoId = json.items?.[0]?.id?.videoId;
if (videoId) {
const url = https://www.youtube.com/watch?v=${videoId};
console.log(Found video: ${url});
resolve(url);
} else {
reject('No video found');
}
} catch (err) {
reject('YouTube parse error: ' + err.message);
}
});
})
.on('error', (err) => reject('YouTube API error: ' + err.message));
});
}
async function downloadAndConvertToGif(videoUrl) {
const timestamp = Date.now();
const outputMp4 = path.join(__dirname, temp_${timestamp}.mp4);
const outputGif = path.join(__dirname, temp_${timestamp}.gif);
const proxy = getRandomProxy();
console.log(Downloading with yt-dlp via proxy: ${proxy});
await ytdlp(videoUrl, {
output: outputMp4,
format: 'mp4',
proxy,
quiet: true,
noWarnings: true
});
console.log('Converting first 8 seconds to GIF...');
return new Promise((resolve, reject) => {
ffmpeg(outputMp4)
.setStartTime(0)
.duration(8)
.outputOptions('-vf', 'fps=10,scale=320:-1:flags=lanczos')
.output(outputGif)
.on('end', () => {
const gifBuffer = fs.readFileSync(outputGif);
fs.unlinkSync(outputMp4);
fs.unlinkSync(outputGif);
resolve(gifBuffer);
})
.on('error', (err) => reject(err))
.run();
});
}
app.post('/yt-hook', async (req, res) => {
const { title, artist } = req.body;
if (!title || !artist) return res.status(400).json({ error: 'Missing title or artist' });
try {
const query = official music video ${title} ${artist};
const videoUrl = await searchYouTubeVideo(query);
const gifBuffer = await downloadAndConvertToGif(videoUrl);
res.setHeader('Content-Type', 'image/gif');
res.send(gifBuffer);

} catch (err) {
console.error('yt-hook error:', err.message || err);
res.status(500).json({ error: err.message || err });
}
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
console.log(Server running on port ${PORT});
});
