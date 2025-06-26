# https://github.com/vercel/turborepo/blob/a2a04ed4eba28602c7cdb36377c75a2f7007e90d/examples/with-docker/apps/web/Dockerfile

FROM node:18-alpine AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
RUN apk update
# Set working directory
WORKDIR /app
# Enable corepack for pnpm
RUN corepack enable
RUN npm install -g turbo
COPY . .
# Only Take packages that are needed to compile this app
RUN turbo prune --scope=@flow/reader --docker

# Add lockfile and package.json's of isolated subworkspace
FROM node:18-alpine AS installer
RUN apk add --no-cache libc6-compat
RUN apk update
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# First install the dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-*.yaml .
RUN pnpm i --frozen-lockfile

# Build the project
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.*json .

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm -F reader build

FROM node:18-alpine AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7127
ENV HOSTNAME="0.0.0.0"

USER nextjs

COPY --from=installer /app/apps/reader/next.config.js .
COPY --from=installer /app/apps/reader/package.json .

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs:nodejs /app/apps/reader/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/reader/.next/static ./apps/reader/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/reader/public ./apps/reader/public

EXPOSE 7127

CMD node apps/reader/server.js
