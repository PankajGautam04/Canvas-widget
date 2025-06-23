#!/bin/bash

apt-get update && \
apt-get install -y wget unzip ffmpeg python3 python3-pip fonts-liberation && \
pip3 install yt-dlp

# Install Chromium into a persistent location
CHROME_URL="https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/1181205/chrome-linux.zip"
wget -O /tmp/chrome.zip "$CHROME_URL" && \
unzip /tmp/chrome.zip -d /opt/chrome && \
chmod +x /opt/chrome/chrome-linux/chrome

npm install
