FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Generate Prisma client before building
RUN npx prisma generate

RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma

# Generate Prisma client again in the production stage
RUN npx prisma generate

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"] 