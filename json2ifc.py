import argparse
import json
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


def normalize_payload(payload):
    if isinstance(payload, dict):
        normalized = dict(payload)
        normalized.setdefault("storeys", [])
        normalized.setdefault("walls", [])
        return normalized

    if isinstance(payload, list):
        walls = []
        for idx, item in enumerate(payload, start=1):
            if not isinstance(item, dict):
                raise ValueError(f"Item {idx} must be an object. Got: {type(item)}")
            if item.get("type") != "wall":
                continue

            geometry = item.get("geometry", {})
            if not geometry:
                raise ValueError(f"Item {idx} missing 'geometry'.")

            start_point = [float(geometry["start_x"]), float(geometry["start_y"])]
            end_point = [float(geometry["end_x"]), float(geometry["end_y"])]
            z_placement = float(geometry.get("start_z", 0.0))

            walls.append(
                {
                    "id": item.get("id", f"wall_{idx - 1}"),
                    "storey": 1,
                    "start_point": start_point,
                    "end_point": end_point,
                    "thickness": float(item.get("thickness", 0.2)),
                    "material": item.get("material", DEFAULTS["material_for_objects"]),
                    "z_placement": z_placement,
                    "height": float(item["height"]),
                    "openings": item.get("openings", []),
                }
            )

        return {"storeys": [], "walls": walls}

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
            slab_name = slab.get("name", f"Slab {idx}")
            slab_points = [list(as_float_pair(p, f"storeys[{idx}].slab.polygon[]")) for p in slab["polygon"]]
            slab_z = float(slab["z"])
            slab_thickness = float(slab["thickness"])
            slab_material = slab.get("material", material_for_objects)
            ifc_slab = ifc_model.create_slab(slab_name, slab_points, slab_z, slab_thickness, slab_material)
            ifc_model.assign_product_to_storey(ifc_slab, ifc_storey)

        spaces = storey.get("spaces", [])
        if spaces:
            ifc_space_placement = ifc_model.space_placement(elevation)
            for space_idx, space in enumerate(spaces, start=1):
                vertices = [list(as_float_pair(v, f"storeys[{idx}].spaces[{space_idx}].vertices[]")) for v in space["vertices"]]
                height = float(space["height"])
                dimensions = {"vertices": vertices}
                ifc_model.create_space(dimensions, ifc_space_placement, idx, space_idx, ifc_storey, height)

    return storeys_ifc


def create_walls_and_openings(ifc_model, storeys_ifc, payload):
    walls = payload.get("walls", [])
    for wall_idx, wall in enumerate(walls, start=1):
        start_point = tuple(as_float_pair(wall["start_point"], f"walls[{wall_idx}].start_point"))
        end_point = tuple(as_float_pair(wall["end_point"], f"walls[{wall_idx}].end_point"))
        wall_thickness = float(wall["thickness"])
        wall_material = wall.get("material", "Concrete")
        wall_z_placement = float(wall["z_placement"])
        wall_height = float(wall["height"])
        storey_number = int(wall["storey"])
        if storey_number < 1 or storey_number > len(storeys_ifc):
            raise ValueError(
                f"walls[{wall_idx}].storey={storey_number} out of range. "
                f"Expected 1..{len(storeys_ifc)}."
            )

        material_layer = ifc_model.create_material_layer(wall_thickness, wall_material)
        material_layer_set = ifc_model.create_material_layer_set([material_layer])
        material_layer_set_usage = ifc_model.create_material_layer_set_usage(material_layer_set, wall_thickness)
        wall_placement = ifc_model.wall_placement(wall_z_placement)
        wall_axis_placement = ifc_model.wall_axis_placement(start_point, end_point)
        wall_axis_representation = ifc_model.wall_axis_representation(wall_axis_placement)
        wall_swept_solid_representation = ifc_model.wall_swept_solid_representation(
            start_point, end_point, wall_height, wall_thickness
        )
        product_definition_shape = ifc_model.product_definition_shape(
            wall_axis_representation, wall_swept_solid_representation
        )
        ifc_wall = ifc_model.create_wall(wall_placement, product_definition_shape)
        ifc_model.assign_material(ifc_wall, material_layer_set_usage)
        wall_type = ifc_model.create_wall_type(ifc_wall, wall_thickness)
        ifc_model.assign_material(wall_type[0], material_layer_set)
        ifc_model.assign_product_to_storey(ifc_wall, storeys_ifc[storey_number - 1])

        for opening_idx, opening in enumerate(wall.get("openings", []), start=1):
            x_start = float(opening["x_range_start"])
            x_end = float(opening["x_range_end"])
            z_min = float(opening["z_range_min"])
            z_max = float(opening["z_range_max"])
            if x_end <= x_start:
                raise ValueError(f"walls[{wall_idx}].openings[{opening_idx}] has x_range_end <= x_range_start.")
            if z_max <= z_min:
                raise ValueError(f"walls[{wall_idx}].openings[{opening_idx}] has z_range_max <= z_range_min.")

            opening_width = x_end - x_start
            opening_height = z_max - z_min
            offset_from_start = x_start
            opening_sill_height = z_min

            opening_closed_profile = ifc_model.opening_closed_profile_def(opening_width, wall_thickness)
            opening_placement = ifc_model.opening_placement(start_point, wall_placement)
            opening_extrusion = ifc_model.opening_extrusion(
                opening_closed_profile,
                opening_height,
                start_point,
                end_point,
                opening_sill_height,
                offset_from_start,
            )
            opening_representation = ifc_model.opening_representation(opening_extrusion)
            opening_product_definition = ifc_model.product_definition_shape_opening(opening_representation)
            wall_opening = ifc_model.create_wall_opening(opening_placement[1], opening_product_definition)
            ifc_model.create_rel_voids_element(ifc_wall, wall_opening)


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

    # Unified element processing loop
    for idx, element in enumerate(payload_raw):
        if not isinstance(element, dict):
            raise ValueError(f"Element at index {idx} is not a dict or missing geometry: {element}")
        el_type = element.get('type')
        if not el_type:
            raise ValueError(f"Element at index {idx} missing 'type' key: {element}")
        # Defensive: check geometry for types that require it
        if el_type in ('wall', 'floor', 'ceiling', 'door', 'beam', 'column', 'window'):
            geometry = element.get('geometry')
            if not isinstance(geometry, dict):
                raise ValueError(f"Element at index {idx} missing or invalid geometry: {element}")
        if el_type == 'wall':
            geometry = element['geometry']
            start_point = (float(geometry['start_x']), float(geometry['start_y']))
            end_point = (float(geometry['end_x']), float(geometry['end_y']))
            wall_thickness = float(element.get('thickness', 0.2))
            wall_material = element.get('material', material_for_objects)
            wall_z_placement = float(geometry.get('start_z', 0.0))
            wall_height = float(element.get('height', 3.0))
            storey_number = int(element.get('storey_number', 1))
            material_layer = ifc_model.create_material_layer(wall_thickness, wall_material)
            material_layer_set = ifc_model.create_material_layer_set([material_layer])
            material_layer_set_usage = ifc_model.create_material_layer_set_usage(material_layer_set, wall_thickness)
            wall_placement = ifc_model.wall_placement(wall_z_placement)
            wall_axis_placement = ifc_model.wall_axis_placement(start_point, end_point)
            wall_axis_representation = ifc_model.wall_axis_representation(wall_axis_placement)
            wall_swept_solid_representation = ifc_model.wall_swept_solid_representation(
                start_point, end_point, wall_height, wall_thickness
            )
            product_definition_shape = ifc_model.product_definition_shape(
                wall_axis_representation, wall_swept_solid_representation
            )
            ifc_wall = ifc_model.create_wall(wall_placement, product_definition_shape)
            ifc_model.assign_material(ifc_wall, material_layer_set_usage)
            wall_type = ifc_model.create_wall_type(ifc_wall, wall_thickness)
            ifc_model.assign_material(wall_type[0], material_layer_set)
            ifc_model.assign_product_to_storey(ifc_wall, storeys_ifc[storey_number - 1])
            # Openings
            for opening in element.get('openings', []):
                x_start = float(opening['x_range_start'])
                x_end = float(opening['x_range_end'])
                z_min = float(opening['z_range_min'])
                z_max = float(opening['z_range_max'])
                opening_width = x_end - x_start
                opening_height = z_max - z_min
                offset_from_start = x_start
                opening_sill_height = z_min
                opening_closed_profile = ifc_model.opening_closed_profile_def(opening_width, wall_thickness)
                opening_placement = ifc_model.opening_placement(start_point, wall_placement)
                opening_extrusion = ifc_model.opening_extrusion(
                    opening_closed_profile,
                    opening_height,
                    start_point,
                    end_point,
                    opening_sill_height,
                    offset_from_start,
                )
                opening_representation = ifc_model.opening_representation(opening_extrusion)
                opening_product_definition = ifc_model.product_definition_shape_opening(opening_representation)
                wall_opening = ifc_model.create_wall_opening(opening_placement[1], opening_product_definition)
                ifc_model.create_rel_voids_element(ifc_wall, wall_opening)
        elif el_type == 'floor':
            geometry = element.get('geometry', {})
            points = polygon_from_element_geometry(element)
            slab_z = float(geometry.get('start_z', 0.0))
            slab_height = float(element.get('thickness', element.get('height', 0.2)))
            material = element.get('material', material_for_objects)
            ifc_slab = ifc_model.create_slab(element['id'], points, slab_z, slab_height, material)
            if storeys_ifc:
                storey_number = int(element.get('storey_number', 1))
                ifc_model.assign_product_to_storey(ifc_slab, storeys_ifc[storey_number - 1])
        elif el_type == 'ceiling':
            geometry = element.get('geometry', {})
            points = polygon_from_element_geometry(element)
            z_elev = float(geometry.get('start_z', 0.0))
            height = float(element.get('thickness', element.get('height', 0.2)))
            material = element.get('material', material_for_objects)
            if hasattr(ifc_model, 'create_ceiling'):
                ifc_ceiling = ifc_model.create_ceiling(element['id'], points, z_elev, height, material)
                if storeys_ifc:
                    storey_number = int(element.get('storey_number', 1))
                    ifc_model.assign_product_to_storey(ifc_ceiling, storeys_ifc[storey_number - 1])
        elif el_type == 'door':
            geometry = element.get('geometry', {})
            if hasattr(ifc_model, 'create_door'):
                door_geometry = dict(geometry)
                door_geometry.setdefault('height', float(element.get('height', 2.1)))
                door_geometry.setdefault('thickness', float(element.get('thickness', 0.1)))
                ifc_model.create_door(element['id'], door_geometry)
        # Add more element types here as needed
        # Inside the "Unified element processing loop" in main()
        elif el_type == 'beam':
            geometry = element.get('geometry', {})
            points = [
                [float(geometry['start_x']), float(geometry['start_y'])],
                [float(geometry['end_x']), float(geometry['end_y'])]
            ]
            z_pos = float(geometry.get('start_z', 0.0))
            height = float(element.get('height', 0.2))
            thickness = float(element.get('thickness', 0.2))
            storey_number = int(element.get('storey_number', 1))
            if hasattr(ifc_model, 'create_beam'):
                ifc_beam = ifc_model.create_beam(element['id'], points, z_pos, height, thickness=thickness)
                ifc_model.assign_product_to_storey(ifc_beam, storeys_ifc[storey_number - 1])

        elif el_type == 'column':
            geometry = element.get('geometry', {})
            center_pt = [float(geometry['start_x']), float(geometry['start_y'])]
            z_pos = float(geometry.get('start_z', 0.0))
            height = float(element.get('height', 3.0))
            radius = float(element.get('thickness', 0.4)) * 0.5
            storey_number = int(element.get('storey_number', 1))
            if hasattr(ifc_model, 'create_column'):
                ifc_col = ifc_model.create_column(element['id'], center_pt, z_pos, height, radius=radius)
                ifc_model.assign_product_to_storey(ifc_col, storeys_ifc[storey_number - 1])

        elif el_type == 'window':
        # Windows are typically openings in walls; ensure your IFCmodel 
        # has a method to create them as independent products or voids
            geometry = element.get('geometry', {})
            if hasattr(ifc_model, 'create_window'):
                window_geometry = dict(geometry)
                window_geometry.setdefault('height', float(element.get('height', 1.2)))
                window_geometry.setdefault('thickness', float(element.get('thickness', 0.1)))
                ifc_model.create_window(element['id'], window_geometry)

    ifc_model.write()
    print(f"IFC model saved to {output_ifc}")
    if args.view_ifc:
        print("Launching IFC preview...")
        _preview_ifc(output_ifc, renderer=args.renderer)


if __name__ == "__main__":
    main()
