const https = require("https");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "your_actual_key_here";

module.exports = async function ytHook(req, res) {
  try {
    const { trackUrl } = req.body;
    if (!trackUrl) return res.status(400).json({ error: "Missing track URL" });

    const songId = trackUrl.split("/").pop().split("?")[0];
    const searchTerm = `official music video ${songId}`;
    const queryUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchTerm)}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1`;

    https.get(queryUrl, (response) => {
      let data = "";
      response.on("data", chunk => data += chunk);
      response.on("end", async () => {
        try {
          const json = JSON.parse(data);
          const videoId = json.items?.[0]?.id?.videoId;
          if (!videoId) return res.status(404).json({ error: "No video found" });

          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const timestamp = Date.now();
          const mp4Path = path.join(__dirname, `yt_${timestamp}.mp4`);
          const gifPath = path.join(__dirname, `yt_${timestamp}.gif`);

          await recordYouTube(videoUrl, mp4Path);

          ffmpeg(mp4Path)
            .duration(8)
            .outputOptions(["-vf", "fps=10,scale=320:-1:flags=lanczos"])
            .loop(0)
            .save(gifPath)
            .on("end", () => {
              res.sendFile(gifPath);
              setTimeout(() => {
                fs.unlink(mp4Path, () => {});
                fs.unlink(gifPath, () => {});
              }, 60000);
            })
            .on("error", err => {
              console.error("GIF conversion failed:", err);
              res.status(500).json({ error: "Failed to convert video to GIF" });
            });
        } catch (err) {
          console.error("Error processing YouTube response:", err);
          res.status(500).json({ error: err.message });
        }
      });
    });

  } catch (err) {
    console.error("ytHook error:", err);
    res.status(500).json({ error: err.message });
  }
};

async function recordYouTube(videoUrl, outputPath) {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      `--window-size=1280,720`
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(videoUrl, { waitUntil: 'networkidle2' });

  // Auto-play the video
  await page.evaluate(() => {
    const video = document.querySelector("video");
    if (video) video.play();
  });

  // Use ffmpeg to record the screen
  const stream = await page.screenshot({ path: outputPath }); // Replace with actual screen recorder later

  await new Promise(resolve => setTimeout(resolve, 8000));

  await browser.close();
}
