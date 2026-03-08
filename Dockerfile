FROM node:20

WORKDIR /app

# ensure Python & dependencies are available for packages that check at install time
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# copy package and typescript config first so npm layers cache when sources change
COPY package.json tsconfig.json ./

RUN npm install

COPY . .

# build TypeScript to JavaScript
RUN npm run build

# optional python/ytdlp installation
RUN pip3 install yt-dlp

EXPOSE 3000

CMD ["node", "dist/index.js"]