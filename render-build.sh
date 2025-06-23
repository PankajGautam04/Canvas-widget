#!/bin/bash

# Update and install dependencies
apt-get update && apt-get install -y wget unzip chromium ffmpeg python3 python3-pip

# Install yt-dlp for fallback (if needed)
pip3 install yt-dlp

# Export Chromium path
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Continue with Node dependencies
npm install
