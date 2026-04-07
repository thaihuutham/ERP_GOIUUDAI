FROM node:22-alpine AS deps
WORKDIR /workspace
COPY package.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN npm install

FROM node:22-alpine AS build
WORKDIR /workspace
ARG NEXT_PUBLIC_API_BASE_URL=http://api:3001/api/v1
ARG NEXT_PUBLIC_AUTH_ENABLED=false
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_AUTH_ENABLED=${NEXT_PUBLIC_AUTH_ENABLED}
COPY --from=deps /workspace/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @erp/shared
RUN npm run build --workspace @erp/ui
RUN npm run build --workspace @erp/web
RUN npm prune --omit=dev --workspaces --include-workspace-root

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/web/.next ./apps/web/.next
COPY --from=build /workspace/apps/web/public ./apps/web/public
COPY --from=build /workspace/apps/web/package.json ./apps/web/package.json
COPY --from=build /workspace/apps/web/next.config.mjs ./apps/web/next.config.mjs
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@erp/web"]
