FROM node:20

WORKDIR /app

# ensure Python & dependencies are available for packages that check at install time
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./

RUN npm install

COPY . .

# separate pip install for yt-dlp (optional, since yt-dlp-exec uses its own binary)
RUN pip3 install yt-dlp

EXPOSE 3000

CMD ["node", "index.js"]