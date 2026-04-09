import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input_json", required=True)
    parser.add_argument("--output_ifc", required=True)
    parser.add_argument("--no-view-ifc", action="store_true")
    args = parser.parse_args()

    input_path = Path(args.input_json)
    data = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not data:
        raise SystemExit("stub_json2ifc.py expected non-empty BIM JSON")

    output_path = Path(args.output_ifc)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("ISO-10303-21;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n", encoding="utf-8")


if __name__ == "__main__":
    main()
