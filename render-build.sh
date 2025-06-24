#!/bin/bash

# Update and install system dependencies
apt-get update && \
apt-get install -y wget unzip ffmpeg python3 python3-pip fonts-liberation && \

# Install yt-dlp globally
pip3 install -U yt-dlp && \

# Install Node.js project dependencies
npm install
