import copy
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.refundpath.demo import demo_details, demo_documents
from app.refundpath.engine import (
    analyse,
    calendar_deadline,
    complaint_channel,
    display_state,
    local_today,
    money,
    registry,
)

NOW = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)


def sample(scenario="matched"):
    details = demo_details(scenario)
    details["course_start"] = "2026-10-07"
    return {"details": details, "documents": demo_documents(details, scenario), "corrections": [], "status": "Waiting for provider", "follow_up_date": "2026-10-20"}


def codes(result):
    return {risk["code"] for risk in result["risks"]}


def change(case, field, value):
    for doc in case["documents"]:
        for fact in doc["facts"]:
            if fact["field"] == field:
                fact["value"] = value


def test_matching_visa_refusal_uses_start_not_letter_date():
    result = analyse(sample(), now=NOW)
    assert not result["risks"]
    assert result["estimate"] == "12000.00"
    assert result["deduction"] == "500.00"
    assert result["deadline"]["date"] == "2026-11-04"
    assert result["deadline"]["trigger"] == "2026-10-07"
    assert result["applied_rules"][0]["section"].startswith("Instrument 2024")
    assert all(f["quote"] and f["page"] and f["document_id"] for f in result["facts"])


@pytest.mark.parametrize("scenario,code", [("missing", "missing_documents"), ("agent", "third_party_payer"), ("conflict", "amount_mismatch"), ("injection", "untrusted_instruction")])
def test_problematic_documents_never_produce_estimate_or_deadline(scenario, code):
    result = analyse(sample(scenario), now=NOW)
    assert code in codes(result)
    assert result["estimate"] is None and result["deadline"] is None


def test_low_confidence():
    case = sample()
    case["documents"][0]["facts"][0]["confidence"] = .6
    result = analyse(case, now=NOW)
    assert "low_confidence" in codes(result) and result["estimate"] is None


def test_conflicting_student_identity():
    case = sample()
    next(f for f in case["documents"][1]["facts"] if f["field"] == "student_name")["value"] = "Demo Student 02"
    result = analyse(case, now=NOW)
    assert "conflicting_student_name" in codes(result)
    assert result["deadline"] is None


@pytest.mark.parametrize("mutation,code", [("recipient", "recipient_mismatch"), ("bank", "bank_change"), ("withdrawn", "condition_previously_withdrawn"), ("provider", "condition_provider_started_course"), ("event", "event_unsupported")])
def test_critical_conditions_block(mutation, code):
    case = sample()
    if mutation == "recipient":
        case["details"]["recipient_name"] = "Demo Student 02"
    elif mutation == "bank":
        case["details"]["bank_changed"] = True
    elif mutation == "withdrawn":
        change(case, "previously_withdrawn", "yes")
    elif mutation == "provider":
        change(case, "provider_started_course", "no")
    else:
        case["details"]["event_type"] = "provider_default"
    result = analyse(case, now=NOW)
    assert code in codes(result)
    assert result["estimate"] is None and result["deadline"] is None


def test_unsupported_deduction_and_missing_source():
    case = sample()
    doc = case["documents"][3]
    doc["facts"].append({**doc["facts"][0], "field": "claimed_deduction", "value": "900.00"})
    result = analyse(case, now=NOW)
    assert "unsupported_deduction" in codes(result)
    case = sample()
    change(case, "default_day", "")
    result = analyse(case, now=NOW)
    assert result["deadline"] is None


@pytest.mark.parametrize("kind", ["missing", "expired", "no-source", "no-rule"])
def test_invalid_registry_never_generates_dates(kind):
    rules = copy.deepcopy(registry())
    if kind == "missing":
        rules = {}
    elif kind == "expired":
        rules["review_due"] = "2026-10-01"
    elif kind == "no-source":
        rules["sources"] = []
    else:
        rules["rules"] = []
    result = analyse(sample(), rules=rules, now=NOW)
    assert "rule_unavailable" in codes(result)
    assert result["deadline"] is None and result["estimate"] is None


def test_money_exact_precision_and_lower_than_cap():
    case = sample()
    change(case, "tuition_paid", "1000.01")
    change(case, "non_tuition_paid", "0.00")
    change(case, "receipt_total", "1000.01")
    change(case, "invoice_total", "1000.01")
    result = analyse(case, now=NOW)
    assert result["deduction"] == "50.00" and result["estimate"] == "950.01"
    assert money("0.01") == Decimal("0.01")


@pytest.mark.parametrize("value", ["-1.00", "NaN", "1e4", "100.999", "AUD 500", "1,000"])
def test_invalid_amounts_are_rejected(value):
    with pytest.raises(ValueError):
        money(value)


def test_mixed_currency_and_future_start_no_conversion_or_deadline():
    case = sample()
    change(case, "currency", "USD")
    result = analyse(case, now=NOW)
    assert "currency" in codes(result) and result["estimate"] is None and result["gross_payments"] is None
    case = sample()
    change(case, "course_start", "2027-02-01")
    change(case, "default_day", "2027-02-01")
    assert analyse(case, now=NOW)["deadline"] is None


def test_calendar_boundaries_leap_year_dst_and_overflow():
    assert calendar_deadline("2024-02-01", 4) == "2024-02-29"
    assert calendar_deadline("2026-12-20", 4) == "2027-01-17"
    assert calendar_deadline("2026-09-20", 4) == "2026-10-18"
    with pytest.raises(OverflowError):
        calendar_deadline("9999-12-20", 4)
    with pytest.raises(ValueError):
        calendar_deadline("2026-02-30", 4)


def test_timezone_and_deadline_boundary_is_due_not_overdue():
    assert local_today(datetime(2026, 10, 14, 14, tzinfo=timezone.utc), "Australia/Sydney").isoformat() == "2026-10-15"
    with pytest.raises(ValueError):
        local_today(datetime(2026, 10, 14), "Australia/Sydney")
    case = sample()
    case["analysis"] = analyse(case, now=NOW)
    same_day = display_state(case, datetime(2026, 11, 3, 23, tzinfo=timezone.utc))
    assert same_day["remaining_days"] == 0 and same_day["display_status"] != "Overdue"
    next_day = display_state(case, datetime(2026, 11, 4, 14, tzinfo=timezone.utc))
    assert next_day["remaining_days"] == -1 and next_day["display_status"] == "Overdue"


def test_complaint_routing_can_remain_uncertain():
    assert "National Student Ombudsman" in complaint_channel("public", "higher education")["label"]
    assert "Commonwealth" in complaint_channel("private", "vet")["label"]
    assert "State or territory" in complaint_channel("public", "vet")["label"]
    assert "unconfirmed" in complaint_channel("unknown", "elicos")["label"]
    assert complaint_channel("private", "vet")["requires_confirmation"]


def test_expired_cached_analysis_is_not_presented_as_current():
    case = sample()
    case["analysis"] = analyse(case, now=NOW)
    case["student_reviewed"] = True
    shown = display_state(case, datetime(2027, 2, 1, tzinfo=timezone.utc))
    assert shown["analysis"]["estimate"] is None and shown["analysis"]["deadline"] is None
    assert shown["display_status"] == "Manual review required"
    assert not shown["student_reviewed"]


def test_generated_masked_documents_can_be_uploaded_and_analysed():
    from app.refundpath.documents import parse_document
    case = sample()
    case["documents"] = [parse_document(d["kind"], d["name"], d["preview"].encode("utf-8")) for d in case["documents"]]
    result = analyse(case, now=NOW)
    assert not result["risks"] and result["estimate"] == "12000.00"
