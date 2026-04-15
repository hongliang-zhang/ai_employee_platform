FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY dist/ ./dist/
RUN mkdir -p /persistent/shared /persistent/conversation && \
    chmod -R 777 /persistent
CMD ["node", "dist/agent.js"]
