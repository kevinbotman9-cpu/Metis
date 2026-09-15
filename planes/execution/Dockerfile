# The decision service. ADR-016 §1.
#
# Built from the repository root. The service reads its sibling packages from
# source (each is imported through the exports map in its package.json; nothing
# is emitted to dist). One release tag builds this image from one commit, so the
# engine it runs is the engine that commit's corpora were generated from.
#
#   docker build -f planes/execution/Dockerfile -t metis-execution .
#
# It runs TypeScript through tsx, as the repository's scripts do. Emitting
# JavaScript for the image is a later refinement with a measurement behind it
# (M8, time-to-ready); it is not a correctness question.

FROM node:20-alpine

WORKDIR /repo

# The repository and its dependencies, from the committed lockfile, exactly as
# CI installs them. The service is an npm workspace (`planes/*`), so `npm ci`
# links it and every @metis package it imports. `.dockerignore` keeps the
# host's node_modules and build output out of the copy.
COPY . .
RUN npm ci

# No METIS_SERVICE_TOKEN and no METIS_DATA_CLASS default, on purpose: an image
# started without the credential refuses to start (G-115), and ADR-016 §4's
# data-class refusal will land the same way.
ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080
USER node
WORKDIR /repo/planes/execution
CMD ["node", "--import", "tsx", "src/main.ts"]
