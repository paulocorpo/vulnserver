# Dockerfile
FROM node:20

WORKDIR /usr/src/app

# copy package files first to use cache
COPY package.json package-lock.json* ./

# install deps (allow dev deps for lab)
RUN npm ci --production=false

# copy app sources
COPY . .

# create uploads directory (app expects it)
RUN mkdir -p /usr/src/app/uploads

EXPOSE 3000

# default command is a simple node start (docker-compose will call it)
CMD ["node", "server.js"]