import argparse
import json
import math
import os
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import open3d as o3d
import pyransac3d as pyrsc
import torch
from scipy.spatial import ConvexHull, QhullError
from sklearn.cluster import DBSCAN
from sklearn.neighbors import NearestNeighbors
from tqdm import tqdm

from model.bimnet import BIMNet

torch.backends.cudnn.benchmark = True

ID_TO_NAME = {
    0: "ceiling",
    1: "floor",
    2: "wall",
    3: "beam",
    4: "column",
    5: "window",
    6: "door",
}


def _rotation_matrix_from_vectors(src, dst):
    src = np.asarray(src, dtype=float)
    dst = np.asarray(dst, dtype=float)
    src /= np.linalg.norm(src) + 1e-12
    dst /= np.linalg.norm(dst) + 1e-12
    v = np.cross(src, dst)
    c = float(np.dot(src, dst))
    s = float(np.linalg.norm(v))

    if s < 1e-10:
        if c > 0.0:
            return np.eye(3, dtype=float)
        # 180-degree turn around any axis perpendicular to src.
        axis = np.array([1.0, 0.0, 0.0], dtype=float)
        if abs(src[0]) > 0.9:
            axis = np.array([0.0, 1.0, 0.0], dtype=float)
        axis -= src * np.dot(src, axis)
        axis /= np.linalg.norm(axis) + 1e-12
        x, y, z = axis
        return np.array([
            [2 * x * x - 1, 2 * x * y, 2 * x * z],
            [2 * x * y, 2 * y * y - 1, 2 * y * z],
            [2 * x * z, 2 * y * z, 2 * z * z - 1],
        ], dtype=float)

    vx = np.array(
        [
            [0.0, -v[2], v[1]],
            [v[2], 0.0, -v[0]],
            [-v[1], v[0], 0.0],
        ],
        dtype=float,
    )
    return np.eye(3, dtype=float) + vx + (vx @ vx) * ((1.0 - c) / (s * s + 1e-12))


def _axis_name(axis_index):
    return ("x", "y", "z")[axis_index]


def _extreme_slab_count(values, lower=True, slab_fraction=0.08):
    if values.size == 0:
        return 0

    lo = float(values.min())
    hi = float(values.max())
    span = hi - lo
    if span <= 1e-9:
        return int(values.size)

    slab = max(span * slab_fraction, 1e-6)
    if lower:
        return int(np.count_nonzero(values <= lo + slab))
    return int(np.count_nonzero(values >= hi - slab))


def _infer_up_axis(points):
    if len(points) == 0:
        return 2, False

    ranges = points.max(axis=0) - points.min(axis=0)
    axis_scores = []
    for axis in range(3):
        low_count = _extreme_slab_count(points[:, axis], lower=True)
        high_count = _extreme_slab_count(points[:, axis], lower=False)
        slab_support = low_count + high_count
        axis_scores.append((float(ranges[axis]), -slab_support, axis, low_count, high_count))

    axis_scores.sort()
    _, _, up_axis, low_count, high_count = axis_scores[0]
    flip_vertical = high_count > max(low_count * 1.15, low_count + 500)
    return up_axis, flip_vertical


def _orient_point_cloud_by_axis_heuristic(pcd):
    if len(pcd.points) == 0:
        return pcd

    points = np.asarray(pcd.points).copy()
    colors = np.asarray(pcd.colors).copy() if pcd.has_colors() else None
    normals = np.asarray(pcd.normals).copy() if pcd.has_normals() else None

    inferred_up_axis, flip_vertical = _infer_up_axis(points)
    print(
        "Auto orientation fallback: "
        f"detected up axis={_axis_name(inferred_up_axis).upper()}, "
        f"flip_vertical={'yes' if flip_vertical else 'no'}"
    )

    if inferred_up_axis != 2:
        perm = [axis for axis in range(3) if axis != inferred_up_axis] + [inferred_up_axis]
        points = points[:, perm]
        if normals is not None:
            normals = normals[:, perm]

    if flip_vertical:
        points[:, 2] *= -1.0
        if normals is not None:
            normals[:, 2] *= -1.0

    points[:, 2] -= float(points[:, 2].min())

    oriented = o3d.geometry.PointCloud()
    oriented.points = o3d.utility.Vector3dVector(points)
    if colors is not None:
        oriented.colors = o3d.utility.Vector3dVector(colors)
    if normals is not None:
        oriented.normals = o3d.utility.Vector3dVector(normals)
    return oriented


def orient_point_cloud_floor_down(
    pcd,
    distance_threshold=0.08,
    ransac_n=3,
    num_iterations=1200,
    max_planes=6,
    min_inlier_ratio=0.08,
):
    if len(pcd.points) < 200:
        oriented = _orient_point_cloud_by_axis_heuristic(pcd)
        print("Auto orientation: used axis heuristic for small point cloud.")
        return oriented

    points = np.asarray(pcd.points)
    total_points = len(points)
    work_pcd = o3d.geometry.PointCloud(pcd)
    best_candidate = None

    for _ in range(max_planes):
        if len(work_pcd.points) < max(200, int(total_points * min_inlier_ratio)):
            break
        try:
            plane_model, inliers = work_pcd.segment_plane(
                distance_threshold=distance_threshold,
                ransac_n=ransac_n,
                num_iterations=num_iterations,
            )
        except RuntimeError:
            break

        if len(inliers) < max(200, int(total_points * min_inlier_ratio)):
            break

        a, b, c, d = plane_model
        normal = np.array([a, b, c], dtype=float)
        normal /= np.linalg.norm(normal) + 1e-12
        horizontal_score = abs(float(normal[2]))
        inlier_points = np.asarray(work_pcd.points)[inliers]
        if best_candidate is None or (
            horizontal_score > best_candidate["horizontal_score"] + 1e-6
            or (
                abs(horizontal_score - best_candidate["horizontal_score"]) <= 1e-6
                and len(inliers) > best_candidate["inlier_count"]
            )
        ):
            best_candidate = {
                "normal": normal,
                "inlier_count": len(inliers),
                "horizontal_score": horizontal_score,
                "plane_center": inlier_points.mean(axis=0),
            }

        work_pcd = work_pcd.select_by_index(inliers, invert=True)

    if best_candidate is None or best_candidate["horizontal_score"] < 0.75:
        print("Auto orientation: no reliable horizontal plane found, using axis heuristic.")
        return _orient_point_cloud_by_axis_heuristic(pcd)

    plane_normal = best_candidate["normal"]
    if plane_normal[2] < 0.0:
        plane_normal = -plane_normal

    rotation = _rotation_matrix_from_vectors(plane_normal, np.array([0.0, 0.0, 1.0], dtype=float))
    rotated_points = points @ rotation.T
    rotated_plane_center = np.asarray(best_candidate["plane_center"], dtype=float) @ rotation.T
    plane_mean_z = float(rotated_plane_center[2])
    below_count = int(np.count_nonzero(rotated_points[:, 2] < plane_mean_z - distance_threshold))
    above_count = int(np.count_nonzero(rotated_points[:, 2] > plane_mean_z + distance_threshold))

    # A floor plane should have most of the scene above it. If the opposite is
    # true, the detected dominant horizontal plane is acting like a ceiling.
    if above_count < below_count:
        flip_rotation = np.array(
            [
                [1.0, 0.0, 0.0],
                [0.0, -1.0, 0.0],
                [0.0, 0.0, -1.0],
            ],
            dtype=float,
        )
        rotation = flip_rotation @ rotation
        rotated_points = points @ rotation.T
        plane_normal = plane_normal @ flip_rotation.T
        print("Auto orientation: flipped scene so most geometry sits above the detected floor plane.")

    rotated_points[:, 2] -= rotated_points[:, 2].min()

    oriented = o3d.geometry.PointCloud()
    oriented.points = o3d.utility.Vector3dVector(rotated_points)
    if pcd.has_colors():
        oriented.colors = o3d.utility.Vector3dVector(np.asarray(pcd.colors))
    if pcd.has_normals():
        normals = np.asarray(pcd.normals) @ rotation.T
        oriented.normals = o3d.utility.Vector3dVector(normals)

    print(
        "Auto orientation: aligned dominant horizontal plane to the floor "
        f"(score={best_candidate['horizontal_score']:.3f}, inliers={best_candidate['inlier_count']}, "
        f"above={above_count}, below={below_count})."
    )
    return oriented


def load_point_cloud(file_path):
    print(f"Loading point cloud from: {file_path}")

    if file_path.suffix in [".ply", ".pcd"]:
        pcd = o3d.io.read_point_cloud(str(file_path))
    else:
        raise ValueError(f"Unsupported file format: {file_path.suffix}")

    print(f"Loaded {len(pcd.points)} points")
    pcd = orient_point_cloud_floor_down(pcd)
    return pcd


def separate_by_label(pcd, point_labels):
    points = np.asarray(pcd.points)
    colors = np.asarray(pcd.colors)

    separated = {}
    for class_id, class_name in ID_TO_NAME.items():
        mask = point_labels == class_id
        if not np.any(mask):
            continue

        class_pcd = o3d.geometry.PointCloud()
        class_pcd.points = o3d.utility.Vector3dVector(points[mask])
        class_pcd.colors = o3d.utility.Vector3dVector(colors[mask])

        separated[class_name] = class_pcd
        print(f"  {class_name}: {mask.sum()} points")

    return separated


def smooth_labels_knn(pcd, labels, k=5):
    print(f"Smoothing labels with KNN (k={k})...")
    points = np.asarray(pcd.points)

    nbrs = NearestNeighbors(n_neighbors=k, algorithm="kd_tree", n_jobs=-1).fit(points)
    _, indices = nbrs.kneighbors(points)

    new_labels = np.zeros_like(labels)
    neighbor_labels = labels[indices]

    from scipy.stats import mode

    try:
        vote_result = mode(neighbor_labels, axis=1, keepdims=False)
        new_labels = vote_result[0]
    except Exception:
        for i in tqdm(range(len(labels)), desc="Voting"):
            counts = np.bincount(neighbor_labels[i])
            new_labels[i] = np.argmax(counts)

    return new_labels


def instantiate_with_dbscan(pcd, class_name, eps=0.1, min_points=100):
    if len(pcd.points) == 0:
        return []

    points = np.asarray(pcd.points)
    colors = np.asarray(pcd.colors)

    print(f"\nClustering {class_name} with DBSCAN...")
    clustering = DBSCAN(eps=eps, min_samples=min_points, n_jobs=-1).fit(points)
    labels = clustering.labels_

    unique_labels = set(labels)
    n_clusters = len(unique_labels) - (1 if -1 in labels else 0)

    print(f"  Found {n_clusters} instances")

    instances = []
    for label_id in unique_labels:
        if label_id == -1:
            continue

        instance_mask = labels == label_id
        instance_points = points[instance_mask]
        instance_colors = colors[instance_mask]

        instance_pcd = o3d.geometry.PointCloud()
        instance_pcd.points = o3d.utility.Vector3dVector(instance_points)
        instance_pcd.colors = o3d.utility.Vector3dVector(instance_colors)

        instances.append(instance_pcd)

    return instances


def filter_small_instances(instances_dict, min_points_thresholds):
    cleaned_dict = {}
    print("\n--- CLEANING NOISE ---")

    for class_name, instances in instances_dict.items():
        thresh = min_points_thresholds.get(class_name, 500)

        valid_instances = []
        for pcd in instances:
            n_points = len(pcd.points)
            if n_points >= thresh:
                valid_instances.append(pcd)

        cleaned_dict[class_name] = valid_instances
        removed = len(instances) - len(valid_instances)
        if removed > 0:
            print(f"  {class_name}: Removed {removed} small instances (<{thresh} pts)")

    return cleaned_dict


def save_instances(instances_dict, output_dir):
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    for class_name, instances in instances_dict.items():
        class_dir = output_path / class_name
        class_dir.mkdir(exist_ok=True)

        for i, instance in enumerate(instances):
            filename = class_dir / f"{class_name}_instance_{i:03d}.ply"
            o3d.io.write_point_cloud(str(filename), instance)

    summary = {class_name: len(instances) for class_name, instances in instances_dict.items()}

    with open(output_path / "instantiation_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nSummary saved to {output_path / 'instantiation_summary.json'}")

    combined_pc = o3d.geometry.PointCloud()
    for class_name, instances in instances_dict.items():
        for instance in instances:
            combined_pc += instance

    combined_filename = output_path / "all_instances_combined.ply"
    o3d.io.write_point_cloud(str(combined_filename), combined_pc)
    print(f"Combined point cloud saved to {combined_filename}")


def generate_distinct_colors(n_colors):
    try:
        cmap = plt.colormaps["tab20"]
    except (AttributeError, KeyError):
        cmap = plt.cm.get_cmap("tab20")

    colors = []
    for i in range(n_colors):
        rgba = cmap(i / max(n_colors, 1))
        colors.append(rgba[:3])
    return colors


def is_visualization_disabled():
    return os.environ.get("DISABLE_OPEN3D_VISUALIZER") == "1"


def visualize_instances(instances_dict, show_by_class=True):
    if is_visualization_disabled():
        print("Skipping Open3D visualization because DISABLE_OPEN3D_VISUALIZER=1")
        return

    if show_by_class:
        for class_name, instances in instances_dict.items():
            if len(instances) == 0:
                continue

            print(f"\nVisualizing {class_name} instances ({len(instances)} instances)...")
            instance_colors = generate_distinct_colors(len(instances))
            colored_instances = []
            for i, instance in enumerate(instances):
                colored_pcd = o3d.geometry.PointCloud(instance)
                instance_color = np.tile(instance_colors[i], (len(instance.points), 1))
                colored_pcd.colors = o3d.utility.Vector3dVector(instance_color)
                colored_instances.append(colored_pcd)

            o3d.visualization.draw_geometries(
                colored_instances,
                window_name=f"{class_name} - {len(instances)} Instances",
                width=1024,
                height=768,
            )
    else:
        print("\nVisualizing all instances from all classes...")
        all_colored_instances = []
        for class_name, instances in instances_dict.items():
            if len(instances) == 0:
                continue
            instance_colors = generate_distinct_colors(len(instances))
            for i, instance in enumerate(instances):
                colored_pcd = o3d.geometry.PointCloud(instance)
                instance_color = np.tile(instance_colors[i], (len(instance.points), 1))
                colored_pcd.colors = o3d.utility.Vector3dVector(instance_color)
                all_colored_instances.append(colored_pcd)

        if all_colored_instances:
            o3d.visualization.draw_geometries(
                all_colored_instances,
                window_name="All Instances",
                width=1024,
                height=768,
            )


def visualize_summary(instances_dict, separated_classes, original_pcd):
    if is_visualization_disabled():
        print("Skipping Open3D visualization because DISABLE_OPEN3D_VISUALIZER=1")
        return

    print("\n" + "=" * 60)
    print("VISUALIZATION MODE")
    print("=" * 60)

    if separated_classes:
        o3d.visualization.draw_geometries(
            list(separated_classes.values()),
            window_name="Semantic Classes",
            width=800,
            height=600,
        )

    if instances_dict:
        visualize_instances(instances_dict, show_by_class=False)

    print("\n" + "=" * 60)
    response = input("Would you like to see all instances from all classes separately? (y/n): ")
    if response.lower() == "y":
        visualize_instances(instances_dict, show_by_class=True)


def finetune_model(checkpoint_path, device, num_old_classes, num_new_classes):
    state_old = torch.load(checkpoint_path, map_location=device)
    model_new = BIMNet(num_classes=num_new_classes)
    state_new = model_new.state_dict()

    transferred, skipped = [], []
    for k, v in state_old.items():
        if k in state_new and state_new[k].shape == v.shape:
            state_new[k] = v
            transferred.append(k)
        else:
            skipped.append(k)

    if skipped:
        print("Skipped parameters:")
        for k in skipped:
            print(f" - {k} : {state_old[k].shape}")

    model_new.load_state_dict(state_new)
    model_new.to(device)
    model_new.train()

    return model_new


def build_models(checkpoint_paths, device, num_classes=7):
    models = []
    for ckpt in checkpoint_paths:
        print(f"Loading checkpoint: {ckpt}")
        model = finetune_model(ckpt, device, num_old_classes=13, num_new_classes=num_classes)
        model.eval()
        models.append(model)
    return models


def voxelize_points(points, cube_edge):
    points_centered = points - points.mean(axis=0)

    points_centered[:, 2] -= points_centered[:, 2].min()

    ranges = points_centered.max(axis=0) - points_centered.min(axis=0)
    max_dim = ranges.max() + 1e-6
    scale_factor = 1.8 / max_dim

    points_norm = points_centered * scale_factor

    points_shifted = points_norm
    points_shifted[:, 2] -= 0.9

    points_shifted += 1.0
    points_grid = np.round(points_shifted * (cube_edge // 2)).astype(np.int32)

    points_grid = np.clip(points_grid, 0, cube_edge - 1)

    vox = np.zeros((1, cube_edge, cube_edge, cube_edge), dtype=np.float32)
    vox[0, points_grid[:, 0], points_grid[:, 1], points_grid[:, 2]] = 1.0

    return vox, points_grid


def color_label(labels, num_classes=7):
    cmap = plt.get_cmap("tab20", num_classes)
    flat = labels.flatten()
    colors = cmap(flat % num_classes)[:, :3]
    return colors.reshape((*labels.shape, 3))


def run_bimnet_inference(pcd, models, cube_edge=96, num_classes=7, device="cuda"):
    points = np.asarray(pcd.points)
    print(f"Loaded {points.shape[0]} points")
    vox, points_grid = voxelize_points(points, cube_edge)
    x = torch.from_numpy(vox).unsqueeze(0).to(device)

    with torch.no_grad():
        logits_sum = None
        for model in models:
            logits = model(x)
            logits_sum = logits if logits_sum is None else logits_sum + logits
        logits_avg = logits_sum / len(models)
        preds = logits_avg.argmax(dim=1).squeeze(0).cpu().numpy()

    colors_volume = color_label(preds, num_classes=num_classes)
    point_colors = colors_volume[points_grid[:, 0], points_grid[:, 1], points_grid[:, 2]]
    point_labels = preds[points_grid[:, 0], points_grid[:, 1], points_grid[:, 2]]

    pcd.colors = o3d.utility.Vector3dVector(point_colors)

    return pcd, preds, points_grid, point_labels


def instantiate_planar_iterative(pcd, class_name, dist_thresh=0.20, min_points=500):
    remaining_pcd = pcd
    instances = []

    print(f"\nIterative RANSAC for {class_name} (Thresh={dist_thresh})...")

    while len(remaining_pcd.points) > min_points:
        points = np.asarray(remaining_pcd.points)

        plane = pyrsc.Plane()
        _, inliers = plane.fit(points, thresh=dist_thresh, minPoints=100, maxIteration=1000)

        if len(inliers) < min_points:
            break

        inst_pcd = remaining_pcd.select_by_index(inliers)
        inst_pcd.paint_uniform_color(generate_distinct_colors(len(instances) + 1)[-1])
        instances.append(inst_pcd)

        remaining_pcd = remaining_pcd.select_by_index(inliers, invert=True)
        print(f"  Found instance {len(instances)}: {len(inliers)} points. Remaining: {len(remaining_pcd.points)}")

    return instances


def _quantile_range(values, lo=0.02, hi=0.98):
    return float(np.quantile(values, lo)), float(np.quantile(values, hi))


def _fit_principal_axes(xy_pts, snap_to_ortho=False):
    centered = xy_pts - np.median(xy_pts, axis=0)
    _, _, vh = np.linalg.svd(centered, full_matrices=False)
    direction = vh[0]
    direction = direction / (np.linalg.norm(direction) + 1e-12)
    if snap_to_ortho:
        angle = math.atan2(direction[1], direction[0])
        snapped_angle = round(angle / (math.pi / 2.0)) * (math.pi / 2.0)
        if abs(angle - snapped_angle) <= math.radians(12.0):
            direction = np.array([math.cos(snapped_angle), math.sin(snapped_angle)], dtype=float)
    normal2d = np.array([-direction[1], direction[0]], dtype=float)
    origin = np.median(xy_pts, axis=0)
    return origin, direction, normal2d


def _minimum_area_rectangle(xy_pts, snap_to_ortho=False):
    pts = np.unique(np.asarray(xy_pts, dtype=float), axis=0)
    if len(pts) < 3:
        return None

    try:
        hull = ConvexHull(pts)
        hull_pts = pts[hull.vertices]
    except QhullError:
        return None

    if len(hull_pts) < 3:
        return None

    hull_loop = np.vstack([hull_pts, hull_pts[0]])
    edges = np.diff(hull_loop, axis=0)
    edge_angles = np.mod(np.arctan2(edges[:, 1], edges[:, 0]), math.pi / 2.0)
    edge_angles = np.unique(np.round(edge_angles, decimals=8))

    best = None
    for angle in edge_angles:
        c = math.cos(angle)
        s = math.sin(angle)
        rot = np.array([[c, s], [-s, c]], dtype=float)
        inv_rot = np.array([[c, -s], [s, c]], dtype=float)

        rotated = hull_pts @ rot.T
        min_x = float(rotated[:, 0].min())
        max_x = float(rotated[:, 0].max())
        min_y = float(rotated[:, 1].min())
        max_y = float(rotated[:, 1].max())
        area = (max_x - min_x) * (max_y - min_y)

        if best is None or area < best["area"]:
            corners_rot = np.array(
                [
                    [min_x, min_y],
                    [max_x, min_y],
                    [max_x, max_y],
                    [min_x, max_y],
                ],
                dtype=float,
            )
            corners = corners_rot @ inv_rot.T
            best = {
                "angle": angle,
                "area": float(area),
                "min_x": min_x,
                "max_x": max_x,
                "min_y": min_y,
                "max_y": max_y,
                "corners": corners,
            }

    if best is None:
        return None

    angle = float(best["angle"])
    if snap_to_ortho:
        snapped = round(angle / (math.pi / 2.0)) * (math.pi / 2.0)
        if abs(angle - snapped) <= math.radians(12.0):
            angle = snapped
            c = math.cos(angle)
            s = math.sin(angle)
            rot = np.array([[c, s], [-s, c]], dtype=float)
            inv_rot = np.array([[c, -s], [s, c]], dtype=float)
            rotated = hull_pts @ rot.T
            min_x = float(rotated[:, 0].min())
            max_x = float(rotated[:, 0].max())
            min_y = float(rotated[:, 1].min())
            max_y = float(rotated[:, 1].max())
            corners_rot = np.array(
                [
                    [min_x, min_y],
                    [max_x, min_y],
                    [max_x, max_y],
                    [min_x, max_y],
                ],
                dtype=float,
            )
            best = {
                "angle": angle,
                "area": float((max_x - min_x) * (max_y - min_y)),
                "min_x": min_x,
                "max_x": max_x,
                "min_y": min_y,
                "max_y": max_y,
                "corners": corners_rot @ inv_rot.T,
            }

    return best


def _fit_oriented_footprint(
    xy_pts,
    snap_to_ortho=False,
    main_lo=0.02,
    main_hi=0.98,
    side_lo=0.05,
    side_hi=0.95,
):
    rect = _minimum_area_rectangle(xy_pts, snap_to_ortho=snap_to_ortho)
    if rect is not None:
        angle = float(rect["angle"])
        direction = np.array([math.cos(angle), math.sin(angle)], dtype=float)
        normal2d = np.array([-direction[1], direction[0]], dtype=float)
        origin = rect["corners"].mean(axis=0)
        main_min = float(rect["min_x"] - np.mean([rect["min_x"], rect["max_x"]]))
        main_max = float(rect["max_x"] - np.mean([rect["min_x"], rect["max_x"]]))
        side_min = float(rect["min_y"] - np.mean([rect["min_y"], rect["max_y"]]))
        side_max = float(rect["max_y"] - np.mean([rect["min_y"], rect["max_y"]]))
        length = float(max(0.0, rect["max_x"] - rect["min_x"]))
        width = float(max(0.0, rect["max_y"] - rect["min_y"]))
        corners = [np.asarray(pt, dtype=float) for pt in rect["corners"]]
        return {
            "origin": origin,
            "direction": direction,
            "normal": normal2d,
            "main_min": main_min,
            "main_max": main_max,
            "side_min": side_min,
            "side_max": side_max,
            "length": length,
            "width": width,
            "corners": corners,
        }

    origin, direction, normal2d = _fit_principal_axes(xy_pts, snap_to_ortho=snap_to_ortho)
    proj_main = (xy_pts - origin) @ direction
    proj_side = (xy_pts - origin) @ normal2d
    main_min, main_max = _quantile_range(proj_main, main_lo, main_hi)
    side_min, side_max = _quantile_range(proj_side, side_lo, side_hi)

    c0 = origin + direction * main_min + normal2d * side_min
    c1 = origin + direction * main_max + normal2d * side_min
    c2 = origin + direction * main_max + normal2d * side_max
    c3 = origin + direction * main_min + normal2d * side_max
    return {
        "origin": origin,
        "direction": direction,
        "normal": normal2d,
        "main_min": main_min,
        "main_max": main_max,
        "side_min": side_min,
        "side_max": side_max,
        "length": float(max(0.0, main_max - main_min)),
        "width": float(max(0.0, side_max - side_min)),
        "corners": [c0, c1, c2, c3],
    }


def _fit_linear_geometry(xy_pts, snap_to_ortho=False):
    footprint = _fit_oriented_footprint(xy_pts, snap_to_ortho=snap_to_ortho)
    side_center = 0.5 * (footprint["side_min"] + footprint["side_max"])
    start_pt = (
        footprint["origin"]
        + footprint["direction"] * footprint["main_min"]
        + footprint["normal"] * side_center
    )
    end_pt = (
        footprint["origin"]
        + footprint["direction"] * footprint["main_max"]
        + footprint["normal"] * side_center
    )
    thickness = float(max(0.05, footprint["width"]))
    polygon = [[float(pt[0]), float(pt[1])] for pt in footprint["corners"]]
    return start_pt, end_pt, thickness, polygon, footprint


def _class_dims_from_points(pts):
    x_min, x_max = _quantile_range(pts[:, 0], 0.05, 0.95)
    y_min, y_max = _quantile_range(pts[:, 1], 0.05, 0.95)
    z_min, z_max = _quantile_range(pts[:, 2], 0.05, 0.95)
    x_span = float(max(0.0, x_max - x_min))
    y_span = float(max(0.0, y_max - y_min))
    z_span = float(max(0.0, z_max - z_min))
    xy_major = float(max(x_span, y_span))
    xy_minor = float(min(x_span, y_span))
    return {
        "x_min": float(x_min),
        "x_max": float(x_max),
        "y_min": float(y_min),
        "y_max": float(y_max),
        "z_min": float(z_min),
        "z_max": float(z_max),
        "x_span": x_span,
        "y_span": y_span,
        "z_span": z_span,
        "xy_major": xy_major,
        "xy_minor": xy_minor,
    }


def _is_plausible_nonwall_element(class_name, dims, footprint, point_count):
    length = float(max(footprint["length"], footprint["width"]))
    width = float(min(footprint["length"], footprint["width"]))
    height = float(dims["z_span"])
    z_min = float(dims["z_min"])
    z_mid = 0.5 * (float(dims["z_min"]) + float(dims["z_max"]))

    if class_name == "beam":
        return (
            point_count >= 180
            and length >= 0.9
            and width <= 0.8
            and height <= 0.9
            and length >= max(1.8 * width, 1.8 * height)
            and z_mid >= 1.8
        )

    if class_name == "column":
        return (
            point_count >= 180
            and height >= 1.8
            and dims["xy_major"] <= 1.0
            and height >= 2.5 * max(dims["xy_major"], 0.2)
        )

    if class_name == "door":
        return (
            point_count >= 120
            and 1.8 <= height <= 2.5
            and 0.6 <= length <= 1.8
            and width <= 0.35
            and z_min <= 0.25
        )

    if class_name == "window":
        return (
            point_count >= 100
            and 0.4 <= height <= 2.2
            and 0.25 <= length <= 3.5
            and width <= 0.5
            and z_min >= 0.3
        )

    return True


def _to_xy_from_geometry(geometry, start=True):
    if start:
        return np.array([float(geometry["start_x"]), float(geometry["start_y"])], dtype=float)
    return np.array([float(geometry["end_x"]), float(geometry["end_y"])], dtype=float)


def _segment_dir(a, b):
    d = b - a
    return d / (np.linalg.norm(d) + 1e-12)


def _point_to_segment_distance(p, a, b):
    ab = b - a
    denom = float(np.dot(ab, ab))
    if denom < 1e-12:
        return float(np.linalg.norm(p - a))
    t = float(np.dot(p - a, ab) / denom)
    t = max(0.0, min(1.0, t))
    proj = a + t * ab
    return float(np.linalg.norm(p - proj))


def _projection_interval(a, b, origin, d_unit):
    ta = float(np.dot(a - origin, d_unit))
    tb = float(np.dot(b - origin, d_unit))
    return min(ta, tb), max(ta, tb)


def _line_intersection(p1, p2, q1, q2):
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = q1
    x4, y4 = q2
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-12:
        return None
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
    return np.array([px, py], dtype=float)


def _angle_parallel(d1, d2, tol_deg=10.0):
    c = abs(float(np.dot(d1, d2)))
    c = min(1.0, max(-1.0, c))
    ang = math.degrees(math.acos(c))
    return ang <= tol_deg


def _merge_collinear_walls(walls, angle_tol_deg=8.0, offset_tol=0.2, gap_tol=0.4):
    merged = []
    used = [False] * len(walls)

    for i, wi in enumerate(walls):
        if used[i]:
            continue
        used[i] = True
        group_idx = [i]

        ai = _to_xy_from_geometry(wi["geometry"], start=True)
        bi = _to_xy_from_geometry(wi["geometry"], start=False)
        di = _segment_dir(ai, bi)

        for j in range(i + 1, len(walls)):
            if used[j]:
                continue
            wj = walls[j]
            aj = _to_xy_from_geometry(wj["geometry"], start=True)
            bj = _to_xy_from_geometry(wj["geometry"], start=False)
            dj = _segment_dir(aj, bj)
            if not _angle_parallel(di, dj, tol_deg=angle_tol_deg):
                continue
            if _point_to_segment_distance(aj, ai, bi) > offset_tol and _point_to_segment_distance(bj, ai, bi) > offset_tol:
                continue

            i0, i1 = _projection_interval(ai, bi, ai, di)
            j0, j1 = _projection_interval(aj, bj, ai, di)
            separated_gap = max(i0, j0) - min(i1, j1)
            if separated_gap > gap_tol:
                continue

            used[j] = True
            group_idx.append(j)

        if len(group_idx) == 1:
            merged.append(wi)
            continue

        pts = []
        heights = []
        thicknesses = []
        openings = []
        z_vals = []
        for k in group_idx:
            wall = walls[k]
            pts.extend(
                [
                    _to_xy_from_geometry(wall["geometry"], start=True),
                    _to_xy_from_geometry(wall["geometry"], start=False),
                ]
            )
            heights.append(float(wall.get("height", 0.0)))
            thicknesses.append(float(wall.get("thickness", 0.2)))
            z_vals.append(float(wall["geometry"].get("start_z", 0.0)))
            openings.extend(wall.get("openings", []))

        ts = [float(np.dot(p - ai, di)) for p in pts]
        start_pt = ai + min(ts) * di
        end_pt = ai + max(ts) * di

        merged_wall = dict(wi)
        merged_wall["height"] = max(heights) if heights else float(wi.get("height", 0.0))
        merged_wall["thickness"] = float(np.median(thicknesses)) if thicknesses else float(wi.get("thickness", 0.2))
        merged_wall["openings"] = openings
        z_base = float(np.median(z_vals)) if z_vals else float(wi["geometry"].get("start_z", 0.0))
        merged_wall["geometry"] = {
            "start_x": float(start_pt[0]),
            "start_y": float(start_pt[1]),
            "start_z": z_base,
            "end_x": float(end_pt[0]),
            "end_y": float(end_pt[1]),
            "end_z": z_base,
        }
        merged.append(merged_wall)

    return merged


def _snap_wall_endpoints_to_intersections(walls, endpoint_snap_tol=0.45, line_proximity_tol=0.25):
    segs = [
        (
            _to_xy_from_geometry(w["geometry"], start=True),
            _to_xy_from_geometry(w["geometry"], start=False),
        )
        for w in walls
    ]

    for i in range(len(walls)):
        ai, bi = segs[i]
        best_start = None
        best_end = None
        best_ds = 1e18
        best_de = 1e18

        for j in range(len(walls)):
            if i == j:
                continue
            aj, bj = segs[j]
            inter = _line_intersection(ai, bi, aj, bj)
            if inter is None:
                continue
            if _point_to_segment_distance(inter, ai, bi) > line_proximity_tol:
                continue
            if _point_to_segment_distance(inter, aj, bj) > line_proximity_tol:
                continue

            ds = float(np.linalg.norm(inter - ai))
            de = float(np.linalg.norm(inter - bi))
            if ds < best_ds and ds <= endpoint_snap_tol:
                best_ds = ds
                best_start = inter
            if de < best_de and de <= endpoint_snap_tol:
                best_de = de
                best_end = inter

        if best_start is not None:
            walls[i]["geometry"]["start_x"] = float(best_start[0])
            walls[i]["geometry"]["start_y"] = float(best_start[1])
        if best_end is not None:
            walls[i]["geometry"]["end_x"] = float(best_end[0])
            walls[i]["geometry"]["end_y"] = float(best_end[1])

    return walls


def _attach_openings_to_walls(walls, openings):
    for wall in walls:
        wall.setdefault("openings", [])

    for opening in openings:
        geom = opening.get("geometry", {})
        center = np.array(
            [
                0.5 * (float(geom["start_x"]) + float(geom["end_x"])),
                0.5 * (float(geom["start_y"]) + float(geom["end_y"])),
            ],
            dtype=float,
        )
        span_xy = float(
            np.linalg.norm(
                [
                    float(geom["end_x"]) - float(geom["start_x"]),
                    float(geom["end_y"]) - float(geom["start_y"]),
                ]
            )
        )
        z_min = float(geom.get("start_z", 0.0))
        z_max = z_min + float(opening.get("height", 0.0))

        best_wall = None
        best_dist = 1e18
        best_proj = None

        for wall in walls:
            wgeom = wall["geometry"]
            a = _to_xy_from_geometry(wgeom, start=True)
            b = _to_xy_from_geometry(wgeom, start=False)
            d = _segment_dir(a, b)
            wall_len = float(np.linalg.norm(b - a))
            wall_thickness = float(wall.get("thickness", 0.2))
            center_dist = _point_to_segment_distance(center, a, b)
            if center_dist > max(0.35, wall_thickness * 1.8):
                continue

            proj = float(np.dot(center - a, d))
            if proj < -0.2 or proj > wall_len + 0.2:
                continue

            if center_dist < best_dist:
                best_dist = center_dist
                best_wall = wall
                best_proj = proj

        if best_wall is None:
            continue

        wall_len = float(
            np.linalg.norm(
                _to_xy_from_geometry(best_wall["geometry"], start=False)
                - _to_xy_from_geometry(best_wall["geometry"], start=True)
            )
        )
        half_span = max(0.25, span_xy * 0.5)
        x_start = max(0.0, best_proj - half_span)
        x_end = min(wall_len, best_proj + half_span)
        if x_end <= x_start:
            continue

        best_wall["openings"].append(
            {
                "id": opening["id"],
                "type": opening["type"],
                "x_range_start": float(x_start),
                "x_range_end": float(x_end),
                "z_range_min": z_min,
                "z_range_max": z_max,
            }
        )


def extract_bim_parameters(instances_dict):
    bim_data = []
    walls = []
    openings = []
    rejected_counts = {"beam": 0, "column": 0, "window": 0, "door": 0}

    wall_pts_all = []
    for wall_pcd in instances_dict.get("wall", []):
        pts = np.asarray(wall_pcd.points)
        if len(pts) >= 500:
            wall_pts_all.append(pts)

    if wall_pts_all:
        wall_all = np.vstack(wall_pts_all)
        wx0, wx1 = _quantile_range(wall_all[:, 0])
        wy0, wy1 = _quantile_range(wall_all[:, 1])
    else:
        wx0 = wx1 = wy0 = wy1 = None

    for class_name, pcd_list in instances_dict.items():
        for idx, pcd in enumerate(pcd_list):
            pts = np.asarray(pcd.points)
            if len(pts) < 50:
                continue
            dims = _class_dims_from_points(pts)
            z_min = float(dims["z_min"])
            z_max = float(dims["z_max"])
            height = float(dims["z_span"])
            if class_name in ["floor", "ceiling"]:
                slab_footprint = _fit_oriented_footprint(
                    pts[:, :2],
                    snap_to_ortho=True,
                    side_lo=0.02,
                    side_hi=0.98,
                )
                slab_polygon = [[float(pt[0]), float(pt[1])] for pt in slab_footprint["corners"]]
                slab_x = [pt[0] for pt in slab_polygon]
                slab_y = [pt[1] for pt in slab_polygon]
                slab_x0 = wx0 if wx0 is not None and class_name == "floor" else min(slab_x)
                slab_x1 = wx1 if wx1 is not None and class_name == "floor" else max(slab_x)
                slab_y0 = wy0 if wy0 is not None and class_name == "floor" else min(slab_y)
                slab_y1 = wy1 if wy1 is not None and class_name == "floor" else max(slab_y)
                slab_thickness = float(np.clip(max(height, 0.18), 0.08, 0.4))
                slab_z = float(z_max - slab_thickness) if class_name == "floor" else float(z_min)

                bim_obj = {
                    "id": f"{class_name}_{idx}",
                    "type": class_name,
                    "height": slab_thickness,
                    "thickness": slab_thickness,
                    "geometry": {
                        "start_x": float(slab_x0),
                        "start_y": float(slab_y0),
                        "start_z": slab_z,
                        "end_x": float(slab_x1),
                        "end_y": float(slab_y1),
                        "end_z": slab_z,
                    },
                    "polygon": slab_polygon,
                }
                bim_data.append(bim_obj)
                continue

            if class_name == "column":
                x_min = dims["x_min"]
                x_max = dims["x_max"]
                y_min = dims["y_min"]
                y_max = dims["y_max"]
                radius = float(np.clip(0.5 * max(x_max - x_min, y_max - y_min), 0.08, 0.6))
                center_x = 0.5 * (x_min + x_max)
                center_y = 0.5 * (y_min + y_max)
                footprint = {
                    "length": float(max(x_max - x_min, y_max - y_min)),
                    "width": float(min(x_max - x_min, y_max - y_min)),
                }
                if not _is_plausible_nonwall_element(class_name, dims, footprint, len(pts)):
                    rejected_counts[class_name] += 1
                    continue
                bim_data.append(
                    {
                        "id": f"{class_name}_{idx}",
                        "type": class_name,
                        "height": float(height),
                        "thickness": radius * 2.0,
                        "geometry": {
                            "start_x": float(center_x),
                            "start_y": float(center_y),
                            "start_z": float(z_min),
                            "end_x": float(center_x),
                            "end_y": float(center_y),
                            "end_z": float(z_min),
                        },
                    }
                )
                continue

            start_pt, end_pt, fitted_thickness, polygon, footprint = _fit_linear_geometry(
                pts[:, :2],
                snap_to_ortho=class_name in ["wall", "beam", "window", "door"],
            )

            if class_name in rejected_counts and not _is_plausible_nonwall_element(
                class_name,
                dims,
                footprint,
                len(pts),
            ):
                rejected_counts[class_name] += 1
                continue

            if class_name == "wall":
                thickness = float(np.clip(fitted_thickness, 0.08, 0.6))
            elif class_name in ["window", "door"]:
                thickness = float(np.clip(fitted_thickness, 0.05, 0.25))
            else:
                thickness = float(np.clip(fitted_thickness, 0.08, 0.8))

            bim_obj = {
                "id": f"{class_name}_{idx}",
                "type": class_name,
                "height": float(height),
                "thickness": thickness,
                "geometry": {
                    "start_x": float(start_pt[0]),
                    "start_y": float(start_pt[1]),
                    "start_z": float(z_min),
                    "end_x": float(end_pt[0]),
                    "end_y": float(end_pt[1]),
                    "end_z": float(z_min),
                },
                "polygon": polygon,
                "length": float(footprint["length"]),
            }

            if class_name == "wall":
                walls.append(bim_obj)
            elif class_name in ["window", "door"]:
                openings.append(bim_obj)
                bim_data.append(bim_obj)
            else:
                bim_data.append(bim_obj)

    walls = _merge_collinear_walls(walls)
    walls = _snap_wall_endpoints_to_intersections(walls)
    _attach_openings_to_walls(walls, openings)
    bim_data.extend(walls)
    rejected_total = sum(rejected_counts.values())
    if rejected_total:
        print(f"Rejected implausible extracted elements: {rejected_counts}")
    return bim_data


def main(
    input_file,
    output_dir="output_instances",
    checkpoint_paths=None,
    cube_edge=96,
    num_classes=7,
    device=None,
    visualize_network_output=False,
    visualize_instances_flag=False,
):
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint_paths = checkpoint_paths

    print("=" * 60)
    print("Point Cloud Instantiation Workflow (BIMNet + DBSCAN)")
    print("=" * 60)

    input_path = Path(input_file)
    pcd = load_point_cloud(input_path)

    print("\nLoading BIMNet models...")
    models = build_models(checkpoint_paths, device, num_classes=num_classes)

    pcd, preds_volume, points_grid, point_labels = run_bimnet_inference(
        pcd, models, cube_edge=cube_edge, num_classes=num_classes, device=device
    )

    print("\nStep 0.5: Smoothing predictions with KNN...")
    point_labels = smooth_labels_knn(pcd, point_labels, k=5)

    print("\nStep 1: Separating point cloud by semantic class...")
    separated_classes = separate_by_label(pcd, point_labels)

    if not separated_classes:
        print("Warning: No classes found! Check your color mappings.")
        return None

    print("\nStep 2: Instantiating classes...")
    all_instances = {}

    planar_classes = ["wall", "floor", "ceiling"]

    dbscan_params = {
        "beam": {"eps": 0.3, "min_points": 100},
        "column": {"eps": 0.3, "min_points": 100},
        "window": {"eps": 0.2, "min_points": 50},
        "door": {"eps": 0.3, "min_points": 100},
    }

    for class_name, class_pcd in separated_classes.items():
        if class_name in planar_classes:
            instances = instantiate_planar_iterative(class_pcd, class_name, dist_thresh=0.1)
        else:
            params = dbscan_params.get(class_name, {"eps": 0.3, "min_points": 100})
            instances = instantiate_with_dbscan(
                class_pcd,
                class_name,
                eps=params["eps"],
                min_points=params["min_points"],
            )
        all_instances[class_name] = instances

    cleaning_thresholds = {
        "ceiling": 2000,
        "floor": 2000,
        "wall": 1000,
        "beam": 180,
        "column": 180,
        "window": 100,
        "door": 120,
    }

    all_instances = filter_small_instances(all_instances, cleaning_thresholds)

    print("\nStep 3: Extracting BIM Parameters and Saving...")
    save_instances(all_instances, output_dir)

    bim_json_data = extract_bim_parameters(all_instances)
    with open(Path(output_dir) / "bim_reconstruction_data.json", "w") as f:
        json.dump(bim_json_data, f, indent=4)
    print(f"BIM parameters saved to {output_dir}/bim_reconstruction_data.json")

    if visualize_instances_flag:
        visualize_summary(all_instances, separated_classes, pcd)

    return all_instances, separated_classes, pcd


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="BIMNet semantic segmentation + DBSCAN instance extraction"
    )
    parser.add_argument("--input_file", help="Path to input point cloud (.ply/.pcd)")
    parser.add_argument("--output_dir", default="output_instances", help="Directory to save instance PLYs")
    parser.add_argument("--checkpoint", action="append", default=[], help="Path(s) to BIMNet checkpoint(s)")
    parser.add_argument("--cube_edge", type=int, default=96, help="Voxel grid edge length")
    parser.add_argument("--num_classes", type=int, default=7, help="Number of BIMNet output classes")
    parser.add_argument("--cpu", action="store_true", help="Force CPU")
    parser.add_argument("--vis-net", action="store_true", help="Visualize BIMNet output")
    parser.add_argument("--vis-instances", action="store_true", help="Visualize DBSCAN instances")
    parser.add_argument("--no-vis-instances", action="store_true", help="Disable instance visualization")

    args = parser.parse_args()
    device = "cpu" if args.cpu else ("cuda" if torch.cuda.is_available() else "cpu")

    main(
        input_file=args.input_file,
        output_dir=args.output_dir,
        checkpoint_paths=args.checkpoint,
        cube_edge=args.cube_edge,
        num_classes=args.num_classes,
        device=device,
        visualize_network_output=args.vis_net,
        visualize_instances_flag=args.vis_instances and not args.no_vis_instances,
    )
