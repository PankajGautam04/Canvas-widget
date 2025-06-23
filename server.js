require('dotenv').config();
const express = require('express');
const { getYoutubeGif } = require('./yt-hook');
const app = express();
const port = process.env.PORT || 3000;

app.get('/get-gif', async (req, res) => {
  const { track, artist } = req.query;
  if (!track || !artist) return res.status(400).json({ error: 'track and artist required' });

  try {
    const gifPath = await getYoutubeGif(track, artist);
    if (gifPath) return res.sendFile(gifPath, { root: __dirname });
    res.status(404).json({ error: 'No video found' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
