import argparse
import json
import sys
from pathlib import Path

from generate_ifc import IFCmodel


DEFAULTS = {
    "output_ifc": "output_IFC/output-from-json.ifc",
    "ifc_project_name": "Sample project",
    "ifc_project_long_name": "Deconstruction of non-load-bearing elements",
    "ifc_project_version": "version 1.0",
    "ifc_author_name": "Slavek",
    "ifc_author_surname": "TEAM13",
    "ifc_author_organization": "SUTD",
    "ifc_building_name": "Hotel Opatov",
    "ifc_building_type": "Hotel",
    "ifc_building_phase": "Reconstruction",
    "ifc_site_latitude": [50, 5, 0],
    "ifc_site_longitude": [4, 22, 0],
    "ifc_site_elevation": 356.0,
    "material_for_objects": "Concrete",
}


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Create IFC directly from a measurements JSON (no point-cloud detection)."
    )
    parser.add_argument(
        "--input_json",
        type=str,
        required=True,
        help="Path to input JSON with slabs/storeys/walls/openings/spaces.",
    )
    parser.add_argument(
        "--output_ifc",
        type=str,
        default=None,
        help="Optional override for output IFC path.",
    )
    parser.add_argument(
        "--view_ifc",
        dest="view_ifc",
        action="store_true",
        help="Show IFC preview after writing the IFC file (default: on).",
    )
    parser.add_argument(
        "--no-view-ifc",
        dest="view_ifc",
        action="store_false",
        help="Do not show IFC preview after writing the IFC file.",
    )
    parser.add_argument(
        "--renderer",
        choices=["open3d", "pyvista"],
        default="open3d",
        help="Renderer for IFC preview (open3d or pyvista).",
    )
    parser.set_defaults(view_ifc=True)
    return parser.parse_args()


def load_input_json(json_path):
    path = Path(json_path)
    if not path.exists():
        raise FileNotFoundError(f"Input JSON not found: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def as_float_pair(point, field_name):
    if not isinstance(point, (list, tuple)) or len(point) != 2:
        raise ValueError(f"{field_name} must be [x, y]. Got: {point}")
    return float(point[0]), float(point[1])


def as_dms_tuple(value, key_name):
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError(f"{key_name} must be [deg, min, sec]. Got: {value}")
    return int(value[0]), int(value[1]), int(value[2])


def get_meta(payload, key):
    if isinstance(payload, dict):
        return payload.get(key, DEFAULTS[key])
    return DEFAULTS[key]


def polygon_from_element_geometry(element):
    polygon = element.get("polygon")
    if isinstance(polygon, list) and len(polygon) >= 3:
        return [list(as_float_pair(p, "polygon[]")) for p in polygon]

    geometry = element.get("geometry", {})
    return [
        [float(geometry["start_x"]), float(geometry["start_y"])],
        [float(geometry["end_x"]), float(geometry["start_y"])],
        [float(geometry["end_x"]), float(geometry["end_y"])],
        [float(geometry["start_x"]), float(geometry["end_y"])],
    ]


def element_base_z(element):
    geometry = element.get("geometry", {})
    return float(geometry.get("start_z", 0.0))


def element_height(element, default=0.0):
    return float(element.get("height", element.get("thickness", default)))


def infer_storey_number(z_value, storey_defs):
    if not storey_defs:
        return 1
    elevations = [float(storey["elevation"]) for storey in storey_defs]
    candidates = [idx + 1 for idx, elevation in enumerate(elevations) if z_value >= elevation - 0.15]
    if candidates:
        return candidates[-1]
    nearest_idx = min(range(len(elevations)), key=lambda idx: abs(elevations[idx] - z_value))
    return nearest_idx + 1


def _warn_skip(message):
    print(f"[json2ifc] Warning: {message}", file=sys.stderr)


def _resolve_storey(storeys_ifc, storey_number, context):
    if not storeys_ifc:
        raise ValueError(f"{context}: no IFC storeys were created.")
    try:
        storey_idx = int(storey_number) - 1
    except Exception:
        _warn_skip(f"{context}: invalid storey '{storey_number}', defaulting to first storey.")
        storey_idx = 0
    if storey_idx < 0 or storey_idx >= len(storeys_ifc):
        _warn_skip(
            f"{context}: storey {storey_number} out of range 1..{len(storeys_ifc)}, clamping to nearest valid storey."
        )
        storey_idx = min(max(storey_idx, 0), len(storeys_ifc) - 1)
    return storeys_ifc[storey_idx]


def _normalize_element_record(item, default_storey=1):
    if not isinstance(item, dict):
        raise ValueError(f"Element must be an object. Got: {type(item)}")
    if "type" not in item:
        raise ValueError(f"Element missing 'type': {item}")
    if item["type"] in {"wall", "floor", "ceiling", "beam", "column", "window", "door"}:
        geometry = item.get("geometry")
        if not isinstance(geometry, dict):
            raise ValueError(f"Element missing or invalid geometry: {item}")
    record = dict(item)
    record.setdefault("id", f"{record['type']}_{default_storey}")
    record.setdefault("material", DEFAULTS["material_for_objects"])
    return record


def normalize_payload(payload):
    if isinstance(payload, dict):
        normalized = dict(payload)
        normalized.setdefault("storeys", [])
        normalized.setdefault("walls", [])
        normalized.setdefault("slabs", [])
        normalized.setdefault("ceilings", [])
        normalized.setdefault("beams", [])
        normalized.setdefault("columns", [])
        normalized.setdefault("doors", [])
        normalized.setdefault("windows", [])
        normalized.setdefault("spaces", [])
        return normalized

    if isinstance(payload, list):
        records = [_normalize_element_record(item, idx) for idx, item in enumerate(payload, start=1)]
        floor_records = [item for item in records if item.get("type") == "floor"]
        floor_records.sort(key=element_base_z)

        storeys = []
        for idx, floor in enumerate(floor_records, start=1):
            floor_polygon = polygon_from_element_geometry(floor)
            floor_z = element_base_z(floor)
            floor_thickness = float(floor.get("thickness", element_height(floor, 0.2)))
            storeys.append(
                {
                    "number": idx,
                    "name": floor.get("name", f"Storey {idx}"),
                    "elevation": floor_z,
                    "slab": {
                        "name": floor.get("id", f"floor_{idx}"),
                        "polygon": floor_polygon,
                        "z": floor_z,
                        "thickness": floor_thickness,
                        "material": floor.get("material", DEFAULTS["material_for_objects"]),
                    },
                }
            )

        if not storeys:
            storeys = [{"number": 1, "name": "Storey 1", "elevation": 0.0}]

        walls = []
        ceilings = []
        beams = []
        columns = []
        windows = []
        doors = []

        for item in records:
            item_type = item.get("type")
            storey_number = infer_storey_number(element_base_z(item), storeys)
            geometry = item.get("geometry", {})
            if item_type == "wall":
                walls.append(
                    {
                        "id": item["id"],
                        "storey": storey_number,
                        "start_point": [float(geometry["start_x"]), float(geometry["start_y"])],
                        "end_point": [float(geometry["end_x"]), float(geometry["end_y"])],
                        "thickness": float(item.get("thickness", 0.2)),
                        "material": item.get("material", DEFAULTS["material_for_objects"]),
                        "z_placement": float(geometry.get("start_z", 0.0)),
                        "height": element_height(item, 3.0),
                        "polygon": item.get("polygon"),
                        "openings": item.get("openings", []),
                    }
                )
            elif item_type == "ceiling":
                record = dict(item)
                record["storey_number"] = storey_number
                ceilings.append(record)
            elif item_type == "beam":
                record = dict(item)
                record["storey_number"] = storey_number
                beams.append(record)
            elif item_type == "column":
                record = dict(item)
                record["storey_number"] = storey_number
                columns.append(record)
            elif item_type == "window":
                record = dict(item)
                record["storey_number"] = storey_number
                windows.append(record)
            elif item_type == "door":
                record = dict(item)
                record["storey_number"] = storey_number
                doors.append(record)

        return {
            "storeys": storeys,
            "walls": walls,
            "slabs": [storey["slab"] for storey in storeys if storey.get("slab")],
            "ceilings": ceilings,
            "beams": beams,
            "columns": columns,
            "windows": windows,
            "doors": doors,
            "spaces": [],
        }

    raise ValueError("Unsupported JSON root. Expected object or array.")


def create_storeys_and_slabs(ifc_model, payload, material_for_objects):
    storeys_ifc = []
    storey_defs = payload.get("storeys", [])

    if not storey_defs:
        storeys_ifc.append(ifc_model.create_building_storey("Floor 0.0 m", 0.0))
        return storeys_ifc

    for idx, storey in enumerate(storey_defs, start=1):
        elevation = float(storey["elevation"])
        storey_name = storey.get("name", f"Floor {elevation:.1f} m")
        ifc_storey = ifc_model.create_building_storey(storey_name, elevation)
        storeys_ifc.append(ifc_storey)

        slab = storey.get("slab")
        if slab:
            try:
                slab_name = slab.get("name", f"Slab {idx}")
                slab_points = [list(as_float_pair(p, f"storeys[{idx}].slab.polygon[]")) for p in slab["polygon"]]
                slab_z = float(slab["z"])
                slab_thickness = float(slab["thickness"])
                slab_material = slab.get("material", material_for_objects)
                ifc_slab = ifc_model.create_slab(slab_name, slab_points, slab_z, slab_thickness, slab_material)
                ifc_model.assign_product_to_storey(ifc_slab, ifc_storey)
            except Exception as exc:
                _warn_skip(f"Skipping slab for storey {idx}: {exc}")

        spaces = storey.get("spaces", [])
        if spaces:
            ifc_space_placement = ifc_model.space_placement(elevation)
            for space_idx, space in enumerate(spaces, start=1):
                try:
                    vertices = [list(as_float_pair(v, f"storeys[{idx}].spaces[{space_idx}].vertices[]")) for v in space["vertices"]]
                    height = float(space["height"])
                    dimensions = {"vertices": vertices}
                    ifc_model.create_space(dimensions, ifc_space_placement, idx, space_idx, ifc_storey, height)
                except Exception as exc:
                    _warn_skip(f"Skipping space {space_idx} on storey {idx}: {exc}")

    return storeys_ifc


def _preview_ifc(ifc_path, renderer):
    from pathlib import Path

    if renderer == "open3d":
        try:
            from view_ifc import export_ifc_to_obj, show_obj
        except Exception as exc:
            raise RuntimeError(
                "Could not import Open3D viewer utilities from view_ifc.py. "
                "Ensure open3d and ifcopenshell geometry support are available."
            ) from exc

        obj_path = str(Path(ifc_path).with_suffix(".obj"))
        export_ifc_to_obj(ifc_path, obj_path)
        show_obj(obj_path)
        return

    try:
        from view_ifc import export_ifc_mesh, show_pyvista
    except Exception as exc:
        raise RuntimeError(
            "Could not import PyVista viewer utilities from view_ifc.py. "
            "Install pyvista, or run with --renderer open3d."
        ) from exc

    vertices, faces = export_ifc_mesh(ifc_path)
    show_pyvista(vertices, faces)


def main():
    args = parse_arguments()
    payload_raw = load_input_json(args.input_json)
    payload = normalize_payload(payload_raw)

    output_ifc = args.output_ifc or get_meta(payload, "output_ifc")
    ifc_project_name = get_meta(payload, "ifc_project_name")
    ifc_project_long_name = get_meta(payload, "ifc_project_long_name")
    ifc_project_version = get_meta(payload, "ifc_project_version")
    ifc_author_name = get_meta(payload, "ifc_author_name")
    ifc_author_surname = get_meta(payload, "ifc_author_surname")
    ifc_author_organization = get_meta(payload, "ifc_author_organization")
    ifc_building_name = get_meta(payload, "ifc_building_name")
    ifc_building_type = get_meta(payload, "ifc_building_type")
    ifc_building_phase = get_meta(payload, "ifc_building_phase")
    ifc_site_latitude = as_dms_tuple(get_meta(payload, "ifc_site_latitude"), "ifc_site_latitude")
    ifc_site_longitude = as_dms_tuple(get_meta(payload, "ifc_site_longitude"), "ifc_site_longitude")
    ifc_site_elevation = float(get_meta(payload, "ifc_site_elevation"))
    material_for_objects = get_meta(payload, "material_for_objects")

    ifc_model = IFCmodel(ifc_project_name, output_ifc)
    ifc_model.define_author_information(f"{ifc_author_name} {ifc_author_surname}", ifc_author_organization)
    ifc_model.define_project_data(
        ifc_building_name,
        ifc_building_type,
        ifc_building_phase,
        ifc_project_long_name,
        ifc_project_version,
        ifc_author_organization,
        ifc_author_name,
        ifc_author_surname,
        ifc_site_latitude,
        ifc_site_longitude,
        ifc_site_elevation,
    )

    storeys_ifc = create_storeys_and_slabs(ifc_model, payload, material_for_objects)

    consumed_opening_ids = set()
    for wall_idx, wall in enumerate(payload.get("walls", []), start=1):
        try:
            start_point = tuple(as_float_pair(wall["start_point"], f"walls[{wall_idx}].start_point"))
            end_point = tuple(as_float_pair(wall["end_point"], f"walls[{wall_idx}].end_point"))
            ifc_wall = ifc_model.create_wall_element(
                name=wall.get("id", f"wall_{wall_idx}"),
                start_point=start_point,
                end_point=end_point,
                z_placement=float(wall["z_placement"]),
                wall_height=float(wall["height"]),
                wall_thickness=float(wall["thickness"]),
                material_name=wall.get("material", material_for_objects),
                openings=wall.get("openings", []),
            )
            ifc_model.assign_product_to_storey(
                ifc_wall,
                _resolve_storey(storeys_ifc, wall.get("storey", 1), f"walls[{wall_idx}]"),
            )
            consumed_opening_ids.update(str(opening.get("id")) for opening in wall.get("openings", []))
        except Exception as exc:
            _warn_skip(f"Skipping wall {wall.get('id', wall_idx)}: {exc}")

    for element in payload.get("ceilings", []):
        try:
            ifc_ceiling = ifc_model.create_ceiling(
                element["id"],
                polygon_from_element_geometry(element),
                element_base_z(element),
                float(element.get("thickness", element_height(element, 0.2))),
                element.get("material", material_for_objects),
            )
            ifc_model.assign_product_to_storey(
                ifc_ceiling,
                _resolve_storey(storeys_ifc, element.get("storey_number", 1), f"ceiling {element.get('id')}"),
            )
        except Exception as exc:
            _warn_skip(f"Skipping ceiling {element.get('id', '?')}: {exc}")

    for element in payload.get("beams", []):
        try:
            geometry = element.get("geometry", {})
            ifc_beam = ifc_model.create_beam(
                element["id"],
                [
                    [float(geometry["start_x"]), float(geometry["start_y"])],
                    [float(geometry["end_x"]), float(geometry["end_y"])],
                ],
                float(geometry.get("start_z", 0.0)),
                element_height(element, 0.2),
                thickness=float(element.get("thickness", 0.2)),
            )
            ifc_model.assign_product_to_storey(
                ifc_beam,
                _resolve_storey(storeys_ifc, element.get("storey_number", 1), f"beam {element.get('id')}"),
            )
        except Exception as exc:
            _warn_skip(f"Skipping beam {element.get('id', '?')}: {exc}")

    for element in payload.get("columns", []):
        try:
            geometry = element.get("geometry", {})
            ifc_column = ifc_model.create_column(
                element["id"],
                [float(geometry["start_x"]), float(geometry["start_y"])],
                float(geometry.get("start_z", 0.0)),
                element_height(element, 3.0),
                radius=float(element.get("thickness", 0.4)) * 0.5,
            )
            ifc_model.assign_product_to_storey(
                ifc_column,
                _resolve_storey(storeys_ifc, element.get("storey_number", 1), f"column {element.get('id')}"),
            )
        except Exception as exc:
            _warn_skip(f"Skipping column {element.get('id', '?')}: {exc}")

    for key, creator_name in (("doors", "create_door"), ("windows", "create_window")):
        creator = getattr(ifc_model, creator_name, None)
        if creator is None:
            continue
        for element in payload.get(key, []):
            if str(element.get("id")) in consumed_opening_ids:
                continue
            try:
                geometry = dict(element.get("geometry", {}))
                geometry.setdefault("height", element_height(element, 2.1 if key == "doors" else 1.2))
                geometry.setdefault("thickness", float(element.get("thickness", 0.1)))
                product = creator(element["id"], geometry)
                ifc_model.assign_product_to_storey(
                    product,
                    _resolve_storey(storeys_ifc, element.get("storey_number", 1), f"{key[:-1]} {element.get('id')}"),
                )
            except Exception as exc:
                _warn_skip(f"Skipping {key[:-1]} {element.get('id', '?')}: {exc}")

    ifc_model.write()
    print(f"IFC model saved to {output_ifc}")
    if args.view_ifc:
        print("Launching IFC preview...")
        _preview_ifc(output_ifc, renderer=args.renderer)


if __name__ == "__main__":
    main()
