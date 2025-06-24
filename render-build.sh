#!/bin/bash

# Update and install dependencies
apt-get update && \
apt-get install -y wget unzip ffmpeg python3 python3-pip fonts-liberation && \

# Install yt-dlp
pip3 install yt-dlp && \

# Set up Chromium manually (for Puppeteer)
mkdir -p ./chromium

CHROME_URL="https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/1181205/chrome-linux.zip"
wget -O /tmp/chrome.zip "$CHROME_URL" && \
unzip -q /tmp/chrome.zip -d ./chromium && \
chmod +x ./chromium/chrome-linux/chrome

# Install Node.js dependencies
npm install
