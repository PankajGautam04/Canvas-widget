#!/bin/bash

apt-get update && \
apt-get install -y wget unzip ffmpeg python3 python3-pip fonts-liberation && \
pip3 install yt-dlp

# Create local directory and install Chromium into it
mkdir -p ./chromium

CHROME_URL="https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/1181205/chrome-linux.zip"
wget -O /tmp/chrome.zip "$CHROME_URL" && \
unzip /tmp/chrome.zip -d ./chromium && \
chmod +x ./chromium/chrome-linux/chrome

npm install
