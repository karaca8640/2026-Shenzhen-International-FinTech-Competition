"""Write fully synthetic local fixtures for the upload presentation."""
from pathlib import Path

from app.refundpath.demo import demo_details, demo_documents


def main():
    details = demo_details()
    output = Path(__file__).resolve().parents[1] / "var" / "synthetic-demo"
    output.mkdir(parents=True, exist_ok=True)
    for doc in demo_documents(details):
        (output / doc["name"]).write_text(doc["preview"], encoding="utf-8")
    print(f"Synthetic documents created in {output}")
    print("Use a new case with the following synthetic details:")
    for key, value in details.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
