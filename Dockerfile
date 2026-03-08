FROM node:20

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg && \
    pip3 install yt-dlp

EXPOSE 3000

CMD ["node", "index.js"]