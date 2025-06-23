#!/bin/bash

apt-get update && \
apt-get install -y wget unzip ffmpeg python3 python3-pip fonts-liberation && \
pip3 install yt-dlp

# Install Chromium manually
CHROME_URL=CHROME_URL="https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/1181205/chrome-linux.zip"
wget -O /tmp/chrome.zip $CHROME_URL && \
unzip /tmp/chrome.zip -d /tmp/chrome

# DO NOT MOVE to /usr/bin — just keep it in /tmp
export CHROME_PATH="/tmp/chrome/chrome-linux/chrome"

npm install
