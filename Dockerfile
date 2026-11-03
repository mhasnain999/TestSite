FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=80 \
    TRUST_PROXY=1

WORKDIR /app

# The server has no npm dependencies: it only needs the server code and the static site.
COPY simplied-server ./simplied-server
COPY simplied-site ./simplied-site

# macOS tarballs can carry AppleDouble ._* files; the KB loader would try to parse them as JSON
RUN find /app -name '._*' -delete

WORKDIR /app/simplied-server
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

USER node
CMD ["node", "server.js"]
