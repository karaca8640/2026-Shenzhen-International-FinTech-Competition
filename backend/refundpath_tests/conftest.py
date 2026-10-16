import httpx
import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from app.db import session as db
from app.db.models import Base
from app.main import app


@pytest.fixture
async def client(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'refundpath.db'}")
    previous = db.engine
    db.configure(engine)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/session")
        yield client
    db.configure(previous)
    await engine.dispose()
