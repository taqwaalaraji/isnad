"""Database access. The worker connects as the database owner, so row-level security does not apply."""

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from isnad_worker.config import settings

_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        # Worker threads start together; only one of them may create the pool.
        with _pool_lock:
            if _pool is None:
                _pool = ConnectionPool(
                    settings.database_url,
                    min_size=1,
                    max_size=max(4, settings.worker_concurrency * 2),
                    kwargs={"row_factory": dict_row, "autocommit": True},
                    open=True,
                )
    return _pool


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    with pool().connection() as conn:
        yield conn


@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    with pool().connection() as conn, conn.transaction():
        yield conn


def fetch_one(query: str, params: Any = None) -> dict | None:
    with connection() as conn:
        return conn.execute(query, params).fetchone()


def fetch_all(query: str, params: Any = None) -> list[dict]:
    with connection() as conn:
        return conn.execute(query, params).fetchall()


def execute(query: str, params: Any = None) -> int:
    """Run a statement; returns the number of rows it affected."""
    with connection() as conn:
        return conn.execute(query, params).rowcount


def json(value: Any) -> Jsonb:
    return Jsonb(value)


def connect() -> psycopg.Connection:
    """A dedicated connection (e.g. for LISTEN), outside the pool."""
    return psycopg.connect(settings.database_url, row_factory=dict_row, autocommit=True)
