FROM node:20-slim
WORKDIR /app
COPY dist/agent.js ./dist/agent.js
RUN mkdir -p /persistent/shared /persistent/conversation && \
    chmod -R 777 /persistent
CMD ["node", "dist/agent.js"]
