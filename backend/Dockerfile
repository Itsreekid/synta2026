# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files and install only production dependencies
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ─── Stage 2: Build student CSS (Tailwind + Preline are dev dependencies) ─────
FROM node:20-alpine AS assets
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
# Only what the Tailwind content scan and build need.
COPY backend/tailwind.config.cjs ./
COPY backend/styles ./styles
COPY backend/views ./views
COPY backend/public/js ./public/js
RUN npm run build:css

# ─── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 synta

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the backend source code
COPY backend/ ./
COPY database/migrations/ ./database/migrations/
# Freshly compiled stylesheet always replaces any copy that came with the source tree.
COPY --from=assets /app/public/css/student-ui.css ./public/css/student-ui.css

USER synta

EXPOSE 3000

CMD ["sh", "-c", "npm run migrate && npm start"]
