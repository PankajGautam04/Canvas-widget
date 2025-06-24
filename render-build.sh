#!/bin/bash

set -e  # Stop the script if any command fails

echo "📦 Updating and installing system dependencies..."
apt-get update && apt-get install -y \
  wget \
  unzip \
  ffmpeg \
  python3 \
  python3-pip \
  fonts-liberation

echo "📥 Installing yt-dlp via pip (optional)..."
pip3 install -U yt-dlp

echo "📦 Installing Node.js project dependencies..."
npm install

echo "✅ render-build.sh completed successfully!"
