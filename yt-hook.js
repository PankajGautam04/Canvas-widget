const https = require("https");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "your_actual_key_here";

module.exports = async function ytHook(req, res) {
  try {
    const { trackUrl } = req.body;
    if (!trackUrl) return res.status(400).json({ error: "Missing track URL" });

    const songId = trackUrl.split("/").pop().split("?")[0];
    const searchTerm = `official music video ${songId}`;
    const queryUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchTerm)}&key=${YOUTUBE_API_KEY}&type=video&maxResults=1`;

    console.log("Querying YouTube API with URL:", queryUrl);

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
          console.error("Error parsing response or downloading/processing video:", err);
          res.status(500).json({ error: err.message });
        }
      });
    });

  } catch (err) {
    console.error("ytHook error:", err);
    res.status(500).json({ error: err.message });
  }
};
