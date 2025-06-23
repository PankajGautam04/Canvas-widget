const express = require("express");
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { execSync } = require("child_process");
const ytHook = require("./yt-hook");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const CHROME_PATH = "/usr/bin/chromium/chrome";

app.post("/extract-canvas", async (req, res) => {
  const { trackUrl } = req.body;
  if (!trackUrl || !trackUrl.includes("spotify.com/track/")) {
    return res.status(400).json({ error: "Invalid Spotify track URL" });
  }

  try {
    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto(`https://www.canvasdownloader.com/canvas?link=${trackUrl}`, {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    await page.waitForSelector("a.download-button", { timeout: 10000 });
    const videoUrl = await page.$eval("a.download-button", el => el.href);

    const timestamp = Date.now();
    const videoPath = path.join(__dirname, `canvas_${timestamp}.mp4`);
    const gifPath = path.join(__dirname, `canvas_${timestamp}.gif`);

    execSync(`curl -L -o ${videoPath} "${videoUrl}"`);

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime("00:00:01")
        .duration(4)
        .outputOptions(["-vf", "fps=10,scale=320:-1:flags=lanczos"])
        .loop(0)
        .save(gifPath)
        .on("end", resolve)
        .on("error", reject);
    });

    await browser.close();
    res.sendFile(gifPath);

    setTimeout(() => {
      fs.unlink(videoPath, () => {});
      fs.unlink(gifPath, () => {});
    }, 60000);

  } catch (err) {
    console.error("Canvas extraction failed, falling back to YouTube:", err.message);
    return ytHook(req, res); // fallback
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
