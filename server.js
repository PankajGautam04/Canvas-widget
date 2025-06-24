const express = require("express");
const path = require("path");
const ytHook = require("./ytHook");

const app = express();
app.use(express.json());

// POST /yt-hook
app.post("/yt-hook", ytHook);

// GET /debug — view recent debug screenshots
app.get("/debug", (req, res) => {
  const fs = require("fs");
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".png") || f.endsWith(".gif"));

  res.setHeader("Content-Type", "text/html");
  res.send(`
    <h2>Debug Artifacts</h2>
    ${files.map(f => `<div><p>${f}</p><img src="/${f}" width="300"/></div>`).join("")}
  `);
});

app.use(express.static(__dirname)); // to serve .png and .gif files

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
