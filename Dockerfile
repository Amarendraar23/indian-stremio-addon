FROM node:24-alpine AS test
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY test ./test
RUN node --test

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7000
WORKDIR /app
COPY --from=test --chown=node:node /app/package.json ./
COPY --from=test --chown=node:node /app/src ./src
USER node
EXPOSE 7000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
