// File: ytHook.js

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
          const gifPath = path.join(__dirname, `yt_${timestamp}.gif`);

          await recordYouTube(videoUrl, gifPath);

          res.sendFile(gifPath);

          setTimeout(() => fs.unlinkSync(gifPath), 60000);

        } catch (err) {
          console.error("YouTube fallback failed:", err);
          res.status(500).json({ error: "Processing failed" });
        }
      });
    });

  } catch (err) {
    console.error("ytHook error:", err);
    res.status(500).json({ error: err.message });
  }
};

async function recordYouTube(videoUrl, gifPath) {
  const browser = await puppeteer.launch({
    headless: false, // use true with xvfb-run
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,720"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 60000 });

  // Click play (YouTube videos auto-pause in headless mode)
  await page.keyboard.press("k");
  await page.waitForTimeout(1000);

  // Take screenshot of visible part as fallback (replace with real screen recording)
  const tempPng = gifPath.replace(".gif", ".png");
  await page.screenshot({ path: tempPng });
  await browser.close();

  // Turn screenshot into GIF placeholder (just a static frame)
  await new Promise((resolve, reject) => {
    ffmpeg(tempPng)
      .loop(8)
      .outputOptions(["-vf", "fps=10,scale=320:-1:flags=lanczos"])
      .save(gifPath)
      .on("end", resolve)
      .on("error", reject);
  });

  fs.unlinkSync(tempPng);
}
