FROM node:20-slim

WORKDIR /app

# Install dependencies (only if package.json exists, which it will after scaffold)
# We copy everything in docker-compose, but for image build cache:
COPY package.json package-lock.json* ./
RUN if [ -f package.json ]; then npm install; fi

# We will mount the code, but copying is good practice for build
COPY . .

# Vite default port
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
