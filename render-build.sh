#!/bin/bash

apt-get update && \
apt-get install -y wget unzip ffmpeg python3 python3-pip fonts-liberation && \
pip3 install yt-dlp

# Install Chromium manually
CHROME_VERSION="121.0.6167.160"
CHROME_URL="https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/1220419/chrome-linux.zip"
wget -O /tmp/chrome.zip $CHROME_URL && \
unzip /tmp/chrome.zip -d /tmp/chrome && \
mv /tmp/chrome/chrome-linux /usr/bin/chromium && \
chmod +x /usr/bin/chromium/chrome

npm install
