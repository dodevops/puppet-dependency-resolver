FROM node:16-alpine

WORKDIR /usr/src/app

COPY . ./

RUN apk add git
RUN npm install && npm test

ENTRYPOINT ["node", "main.js"]
