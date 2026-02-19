FROM node:18-slim

# Install Chromium, ImageMagick, and dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    imagemagick \
    fonts-freefont-ttf \
    fonts-liberation \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to skip downloading Chromium (we use system Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application source
COPY . .

# Expose the port
EXPOSE 3000

# Run the application
CMD ["node", "index.js"]
