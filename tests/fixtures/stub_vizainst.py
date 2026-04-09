import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input_file", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--checkpoint", action="append", default=[])
    parser.add_argument("--no-vis-instances", action="store_true")
    parser.add_argument("--cpu", action="store_true")
    args, _ = parser.parse_known_args()

    input_path = Path(args.input_file)
    if input_path.suffix.lower() != ".ply":
        raise SystemExit("stub_vizainst.py expected a .ply input")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    wall_dir = output_dir / "wall"
    wall_dir.mkdir(parents=True, exist_ok=True)

    ply_payload = """ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
end_header
0 0 0
1 0 0
0 1 0
"""

    (wall_dir / "wall_instance_000.ply").write_text(ply_payload, encoding="utf-8")
    (output_dir / "all_instances_combined.ply").write_text(ply_payload, encoding="utf-8")
    (output_dir / "instantiation_summary.json").write_text(
        json.dumps({"wall": 1}, indent=2),
        encoding="utf-8",
    )
    (output_dir / "bim_reconstruction_data.json").write_text(
        json.dumps(
            [
                {
                    "id": "wall_0",
                    "type": "wall",
                    "height": 3.0,
                    "thickness": 0.2,
                    "geometry": {
                        "start_x": 0.0,
                        "start_y": 0.0,
                        "start_z": 0.0,
                        "end_x": 1.0,
                        "end_y": 0.0,
                        "end_z": 0.0,
                    },
                }
            ],
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Run output directory: {output_dir}")
    print("Step 3: Extracting BIM Parameters and Saving...")


if __name__ == "__main__":
    main()
