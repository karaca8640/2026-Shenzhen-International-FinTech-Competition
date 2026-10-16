import logging

import httpx

from app.main import app


async def demo(client, scenario="matched"):
    response = await client.post("/api/demo", json={"scenario": scenario})
    assert response.status_code == 201
    return response.json()


async def approved_draft(client):
    case = await demo(client)
    reviewed = await client.post(f"/api/cases/{case['id']}/review", json={"approved": True, "content_version": case["content_version"]})
    assert reviewed.status_code == 200
    response = await client.post(f"/api/cases/{case['id']}/drafts", json={"kind": "refund"})
    assert response.status_code == 200
    return response.json()


async def test_end_to_end_requires_explicit_approval_and_is_idempotent(client):
    case = await approved_draft(client)
    draft = case["drafts"][0]
    path = f"/api/cases/{case['id']}/drafts/{draft['id']}"
    blocked = await client.post(path + "/simulate", json={"channel_confirmed": False})
    assert blocked.status_code == 409
    assert not (await client.get(f"/api/cases/{case['id']}")).json()["drafts"][0]["simulated_at"]
    approved = await client.post(path + "/approve", json={"approved": True, "content_version": case["content_version"]})
    assert approved.status_code == 200
    simulated = await client.post(path + "/simulate", json={"channel_confirmed": False})
    assert simulated.status_code == 200 and simulated.json()["status"] == "Waiting for provider"
    assert simulated.json()["drafts"][0]["simulated_at"]
    duplicate = await client.post(path + "/simulate", json={"channel_confirmed": False})
    assert duplicate.status_code == 409
    follow_up = await client.post(f"/api/cases/{case['id']}/drafts", json={"kind": "follow_up"})
    assert follow_up.status_code == 200 and not follow_up.json()["drafts"][-1]["approved"]
    resolved = await client.post(f"/api/cases/{case['id']}/resolve")
    assert resolved.json()["status"] == "Resolved"


async def test_without_evidence_review_refund_draft_cannot_be_created(client):
    case = await demo(client)
    assert (await client.post(f"/api/cases/{case['id']}/drafts", json={"kind": "refund"})).status_code == 409


async def test_agent_risk_cannot_be_overridden_by_student(client):
    case = await demo(client, "agent")
    response = await client.post(f"/api/cases/{case['id']}/review", json={"approved": True, "content_version": case["content_version"]})
    assert response.status_code == 409 and case["analysis"]["estimate"] is None


async def test_changed_evidence_invalidates_approval(client):
    case = await approved_draft(client)
    draft = case["drafts"][0]
    path = f"/api/cases/{case['id']}/drafts/{draft['id']}"
    await client.post(path + "/approve", json={"approved": True, "content_version": case["content_version"]})
    changed = await client.patch(f"/api/cases/{case['id']}", json={**case["details"], "recipient_name": "Demo Student 02"})
    assert changed.json()["drafts"][0]["stale"] and not changed.json()["student_reviewed"]
    assert (await client.post(path + "/simulate", json={"channel_confirmed": False})).status_code == 409


async def test_private_sessions_are_isolated(client):
    case = await demo(client)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as other:
        assert (await other.get("/api/cases")).status_code == 401
        await other.post("/api/session")
        assert (await other.get("/api/cases")).json() == []
        assert (await other.get(f"/api/cases/{case['id']}")).status_code == 404
        assert (await other.delete(f"/api/cases/{case['id']}")).status_code == 404


async def test_complaint_channel_confirmation_and_approval_required(client):
    case = await demo(client, "missing")
    result = await client.post(f"/api/cases/{case['id']}/drafts", json={"kind": "complaint"})
    draft = result.json()["drafts"][0]
    path = f"/api/cases/{case['id']}/drafts/{draft['id']}"
    await client.post(path + "/approve", json={"approved": True, "content_version": case["content_version"]})
    assert (await client.post(path + "/simulate", json={"channel_confirmed": False})).status_code == 409
    result = await client.post(path + "/simulate", json={"channel_confirmed": True})
    assert result.json()["status"] == "Escalated"


async def test_upload_and_delete_leave_no_raw_file_or_private_log(client, caplog):
    case = await demo(client)
    caplog.set_level(logging.INFO)
    result = await client.post(f"/api/cases/{case['id']}/documents/agent", files={"file": ("../../payment.txt", b"Passport: Q1234567\nAccount number: 9988776655\nAgent fees: 15.00\n", "text/plain")})
    assert result.status_code == 200
    doc = result.json()["documents"][-1]
    assert doc["name"] == "payment.txt" and not doc["raw_retained"]
    assert "9988776655" not in result.text and "Q1234567" not in result.text
    assert "9988776655" not in caplog.text and "Q1234567" not in caplog.text
    removed = await client.delete(f"/api/cases/{case['id']}/documents/{doc['id']}")
    assert not any(d["id"] == doc["id"] for d in removed.json()["documents"])
    assert (await client.delete(f"/api/cases/{case['id']}")).status_code == 204
    assert (await client.get(f"/api/cases/{case['id']}")).status_code == 404


async def test_schema_errors_do_not_echo_private_inputs(client):
    result = await client.post("/api/cases", json={"student_name": "Passport: Q1234567", "secret": "9988776655"})
    assert result.status_code == 422
    assert "Q1234567" not in result.text and "9988776655" not in result.text


async def test_cross_origin_mutation_rejected(client):
    assert (await client.post("/api/demo", json={"scenario": "matched"}, headers={"Origin": "https://untrusted.example"})).status_code == 403


async def test_oversized_chunked_body_is_rejected(client):
    async def chunks():
        for _ in range(6):
            yield b"x" * 1024 * 1024
    result = await client.post("/api/demo", content=chunks(), headers={"content-type": "application/json"})
    assert result.status_code == 413


async def test_local_assistant_no_api_needed_and_consent_revocable(client, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "llm_provider", "fake")
    case = await demo(client)
    response = await client.post(f"/api/cases/{case['id']}/assist", json={"opt_in": False})
    assert "no external API" in response.json()["assistant_summary"]["method"]
    await client.post(f"/api/cases/{case['id']}/ai-consent", json={"opt_in": True})
    revoked = await client.post(f"/api/cases/{case['id']}/ai-consent", json={"opt_in": False})
    assert not revoked.json()["external_ai_opt_in"]


async def test_external_ai_never_called_without_both_consents(client, monkeypatch):
    from app.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "llm_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", "synthetic-test-placeholder")
    case = await demo(client)
    path = f"/api/cases/{case['id']}"
    assert (await client.post(path + "/assist", json={"opt_in": True})).status_code == 403
    await client.post(path + "/ai-consent", json={"opt_in": True})
    assert (await client.post(path + "/assist", json={"opt_in": False})).status_code == 403


async def test_source_correction_cannot_relabel_other_evidence(client):
    case = await demo(client)
    receipt = next(d for d in case["documents"] if d["kind"] == "receipt")
    response = await client.post(f"/api/cases/{case['id']}/corrections", json={"field": "default_day", "value": "12500.00", "document_id": receipt["id"], "page": 1, "quote": "Receipt total: 12500.00"})
    assert response.status_code == 200
    analysed = (await client.post(f"/api/cases/{case['id']}/analyse")).json()["analysis"]
    assert analysed["estimate"] is None and analysed["deadline"] is None
    assert any(r["code"] == "unsourced_correction" for r in analysed["risks"])


async def test_unexpected_error_does_not_log_private_exception(client, monkeypatch, caplog):
    from app.refundpath import api
    case = await demo(client)
    async def private_failure(*_args):
        raise RuntimeError("Passport: Q12A34B, Account number: 9988776655")
    monkeypatch.setattr(api, "save", private_failure)
    caplog.set_level(logging.ERROR)
    response = await client.post(f"/api/cases/{case['id']}/resolve")
    assert response.status_code == 500
    assert "Q12A34B" not in response.text + caplog.text
    assert "9988776655" not in response.text + caplog.text


async def test_expired_session_and_data_are_purged(client):
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select, update

    from app.db import session as db
    from app.refundpath.api import purge_expired
    from app.refundpath.models import RefundCase, SandboxSession
    await demo(client)
    async with db.SessionLocal() as s:
        await s.execute(update(SandboxSession).values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
        await s.commit()
    assert (await client.get("/api/cases")).status_code == 401
    await purge_expired()
    async with db.SessionLocal() as s:
        assert not (await s.scalars(select(RefundCase))).all()
        assert not (await s.scalars(select(SandboxSession))).all()


async def test_revision_prevents_concurrent_lost_update(client):
    import pytest
    from fastapi import HTTPException

    from app.refundpath.api import load, save
    case = await demo(client)
    from sqlalchemy import select

    from app.db import session as db
    from app.refundpath.models import RefundCase
    async with db.SessionLocal() as s:
        record = await s.scalar(select(RefundCase).where(RefundCase.id == case["id"]))
        owner = record.owner_id
    first, version = await load(case["id"], owner)
    second, _ = await load(case["id"], owner)
    first["follow_up_date"] = "2026-12-01"
    await save(first, version, owner)
    second["follow_up_date"] = "2026-12-02"
    with pytest.raises(HTTPException) as conflict:
        await save(second, version, owner)
    assert conflict.value.status_code == 409


async def test_unknown_api_is_not_served_as_frontend_html(client):
    response = await client.get("/api/no-such-endpoint")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
