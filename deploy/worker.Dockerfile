# syntax=docker/dockerfile:1.7
# The Python worker: one image for the pipeline worker, the webhook API and the Telegram bot
# (they differ only in their command). Build from the repository root:
#   docker build -f deploy/worker.Dockerfile .

FROM python:3.12-slim-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 isnad
COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# Dependencies first, so code changes don't reinstall them.
COPY worker/pyproject.toml worker/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY worker/src ./src
COPY worker/seed_data ./seed_data
RUN uv sync --frozen --no-dev && chown -R isnad:isnad /app

USER isnad
# Overridden per service in docker-compose.yml (api, bot).
CMD ["python", "-m", "isnad_worker.runner"]
