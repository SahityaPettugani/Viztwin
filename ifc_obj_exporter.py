#!/usr/bin/env python
import argparse
import json
import os

import numpy as np
import ifcopenshell
import ifcopenshell.geom


def export_ifc_obj_and_props(ifc_path: str, obj_path: str, props_path: str) -> None:
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    model = ifcopenshell.open(ifc_path)
    os.makedirs(os.path.dirname(obj_path), exist_ok=True)
    os.makedirs(os.path.dirname(props_path), exist_ok=True)

    vertex_offset = 0
    props = {}

    with open(obj_path, "w", encoding="utf-8") as f:
        for product in model.by_type("IfcProduct"):
            if not getattr(product, "Representation", None):
                continue

            try:
                shape = ifcopenshell.geom.create_shape(settings, product)
            except Exception:
                continue

            verts = np.array(shape.geometry.verts, dtype=float).reshape(-1, 3)
            faces = np.array(shape.geometry.faces, dtype=int).reshape(-1, 3)
            if verts.size == 0 or faces.size == 0:
                continue

            global_id = getattr(product, "GlobalId", None) or f"prod_{product.id()}"
            class_name = product.is_a()
            name = getattr(product, "Name", None) or class_name

            f.write(f"o {global_id}\n")
            for v in verts:
                f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
            for tri in faces:
                f.write(
                    f"f {tri[0] + 1 + vertex_offset} "
                    f"{tri[1] + 1 + vertex_offset} "
                    f"{tri[2] + 1 + vertex_offset}\n"
                )

            mins = verts.min(axis=0)
            maxs = verts.max(axis=0)
            dims = maxs - mins
            props[global_id] = {
                "id": global_id,
                "className": class_name,
                "name": name,
                "dimensions": {
                    "x": float(dims[0]),
                    "y": float(dims[1]),
                    "z": float(dims[2]),
                },
            }

            vertex_offset += verts.shape[0]

    with open(props_path, "w", encoding="utf-8") as pf:
        json.dump(props, pf, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export IFC to OBJ and per-element properties JSON.")
    parser.add_argument("--ifc_path", required=True, help="Path to IFC file")
    parser.add_argument("--obj_path", required=True, help="Path to output OBJ file")
    parser.add_argument("--props_path", required=True, help="Path to output JSON properties file")
    args = parser.parse_args()

    export_ifc_obj_and_props(args.ifc_path, args.obj_path, args.props_path)
    print(f"OBJ saved: {args.obj_path}")
    print(f"Properties saved: {args.props_path}")


if __name__ == "__main__":
    main()
