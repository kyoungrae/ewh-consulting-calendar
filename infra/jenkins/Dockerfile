FROM node:24-bookworm-slim AS source
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

FROM source AS verify
RUN npm run lint && npm run build
CMD ["npm", "test"]

FROM source AS firebase
ARG FIREBASE_TOOLS_VERSION=15.10.1
RUN npm install --global "firebase-tools@${FIREBASE_TOOLS_VERSION}"
ARG FUNNEL_API_BASE_URL
ENV FUNNEL_API_BASE_URL=${FUNNEL_API_BASE_URL}
RUN npm run build:hosting
