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

# yt-dlp-exec bundles its own binary, so no need to install yt-dlp separately
# (Debian 12 also blocks global pip installs anyway)

EXPOSE 3000

CMD ["node", "dist/index.js"]