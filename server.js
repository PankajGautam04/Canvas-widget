const express = require("express");
const https = require("https");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // Serve media and debug files

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "your_actual_key_here";

// Clean up old files
function cleanUpFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// 🔄 GIF Extraction from YouTube video
app.post("/extract-gif", async (req, res) => {
  const { trackUrl } = req.body;
  if (!trackUrl) return res.status(400).json({ error: "Missing track URL" });

  const songId = trackUrl.split("/").pop().split("?")[0];
  const searchTerm = `official music video ${songId}`;
  const queryUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchTerm)}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1`;

  console.log("Querying YouTube API:", queryUrl);

  https.get(queryUrl, (response) => {
    let data = "";
    response.on("data", chunk => data += chunk);
    response.on("end", () => {
      try {
        const json = JSON.parse(data);
        const videoId = json.items?.[0]?.id?.videoId;
        if (!videoId) return res.status(404).json({ error: "No video found" });

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const timestamp = Date.now();
        const mp4Path = path.join(__dirname, `yt_${timestamp}.mp4`);
        const gifPath = path.join(__dirname, `yt_${timestamp}.gif`);

        execSync(`python3 -m yt_dlp -f mp4 -o "${mp4Path}" "${videoUrl}"`, { stdio: "pipe" });

        ffmpeg(mp4Path)
          .setStartTime("00:00:30")
          .duration(5)
          .outputOptions(["-vf", "fps=10,scale=320:-1:flags=lanczos"])
          .loop(0)
          .save(gifPath)
          .on("end", () => {
            res.sendFile(gifPath);
            // Delete after 60 seconds
            setTimeout(() => {
              cleanUpFile(mp4Path);
              cleanUpFile(gifPath);
            }, 60000);
          })
          .on("error", err => {
            console.error("GIF conversion failed:", err);
            res.status(500).json({ error: "Failed to convert video to GIF" });
          });

      } catch (err) {
        console.error("Parsing or conversion error:", err);
        res.status(500).json({ error: "Unexpected error: " + err.message });
      }
    });
  }).on("error", err => {
    console.error("YouTube API error:", err);
    res.status(500).json({ error: "Failed to contact YouTube API" });
  });
});

// 🧪 Debug Route to View All GIFs and MP4s
app.get("/debug", (req, res) => {
  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith(".gif") || f.endsWith(".mp4"))
    .sort((a, b) => fs.statSync(path.join(__dirname, b)).mtimeMs - fs.statSync(path.join(__dirname, a)).mtimeMs);

  if (files.length === 0) return res.status(404).send("No media files found.");

  res.setHeader("Content-Type", "text/html");
  res.send(`
    <h2>Debug: GIFs and MP4s</h2>
    ${files.map(f => `
      <div style="margin-bottom:20px;">
        <p><strong>${f}</strong></p>
        ${f.endsWith(".gif")
          ? `<img src="/${f}" width="300"/>`
          : `<video width="300" controls src="/${f}"></video>`}
      </div>
    `).join("")}
  `);
});

// 🔁 Server Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
