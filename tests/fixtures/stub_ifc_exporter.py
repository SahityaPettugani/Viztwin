import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ifc_path", required=True)
    parser.add_argument("--obj_path", required=True)
    parser.add_argument("--props_path", required=True)
    args = parser.parse_args()

    ifc_path = Path(args.ifc_path)
    if not ifc_path.exists():
        raise SystemExit("stub_ifc_exporter.py expected IFC input")

    obj_path = Path(args.obj_path)
    props_path = Path(args.props_path)
    obj_path.parent.mkdir(parents=True, exist_ok=True)
    obj_path.write_text("o bim_model\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n", encoding="utf-8")
    props_path.write_text(
        json.dumps({"elements": [{"id": "wall_0", "type": "wall"}]}, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
