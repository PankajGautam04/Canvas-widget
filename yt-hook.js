const https = require("https");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const puppeteer = require("puppeteer");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

module.exports = async function ytHook(req, res) {
  const { song, artist } = req.body;
  if (!song || !artist) {
    return res.status(400).json({ error: "Missing 'song' or 'artist' in request body" });
  }

  const searchTerm = `${song} ${artist} official music video`;
  const queryUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchTerm)}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1`;

  https.get(queryUrl, response => {
    let data = "";
    response.on("data", chunk => data += chunk);
    response.on("end", async () => {
      try {
        const json = JSON.parse(data);
        const videoId = json.items?.[0]?.id?.videoId;
        if (!videoId) return res.status(404).json({ error: "No YouTube video found" });

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const timestamp = Date.now();
        const webmPath = path.join(__dirname, `yt_${timestamp}.webm`);
        const gifPath = path.join(__dirname, `yt_${timestamp}.gif`);
        const screenshotPath = path.join(__dirname, `yt_debug_${timestamp}.png`);

        // Launch headless browser
        const browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 640, height: 360 });
        await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 60000 });

        // Wait for video to load and autoplay
        await page.waitForSelector("video", { timeout: 15000 });
        await page.screenshot({ path: screenshotPath });

        const stream = await page.evaluateHandle(() => {
          const canvas = document.createElement("canvas");
          const video = document.querySelector("video");
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          const ctx = canvas.getContext("2d");

          return new MediaStream([canvas.captureStream(10).getVideoTracks()[0]]);
        });

        const recorder = require("node-webm-recorder");
        const buffer = await recorder(stream, 8000); // record for 8s
        fs.writeFileSync(webmPath, buffer);

        await browser.close();

        ffmpeg(webmPath)
          .outputOptions("-vf", "fps=10,scale=320:-1:flags=lanczos")
          .duration(8)
          .save(gifPath)
          .on("end", () => {
            res.sendFile(gifPath);
            setTimeout(() => {
              fs.unlink(webmPath, () => {});
              fs.unlink(gifPath, () => {});
              fs.unlink(screenshotPath, () => {});
            }, 60000);
          })
          .on("error", err => {
            console.error("FFmpeg error:", err);
            res.status(500).json({ error: "Failed to convert to GIF" });
          });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to parse YouTube response" });
      }
    });
  }).on("error", err => {
    console.error(err);
    res.status(500).json({ error: "YouTube API call failed" });
  });
};
