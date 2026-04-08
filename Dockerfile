FROM oven/bun AS builder

WORKDIR /app
COPY package.json bun.lock* pnpm-lock.yaml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build ./src/cli.ts --compile --outfile polar

FROM debian:bookworm-slim

COPY --from=builder /app/polar /usr/local/bin/polar

ENTRYPOINT ["polar"]
