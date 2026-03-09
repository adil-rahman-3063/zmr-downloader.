FROM node:20

WORKDIR /app

# ensure Python & dependencies are available for packages that check at install time
# we need a `python` binary so node packages (yt-dlp-exec) can verify its version
RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# copy package and typescript config first so npm layers cache when sources change
COPY package.json tsconfig.json ./

RUN npm install

COPY . .

# build TypeScript to JavaScript
RUN npm run build

# Install yt-dlp - download latest from GitHub
RUN apt-get update && \
    apt-get install -y curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 3000

ENV NODE_ENV=production
ENV YT_DLP=/usr/local/bin/yt-dlp

CMD ["node", "dist/index.js"]