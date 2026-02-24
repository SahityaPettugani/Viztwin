#!/usr/bin/env python
"""
Headless runner for BIMNet + instantiation (DBSCAN/RANSAC).
Writes outputs to the provided output directory.
"""
import sys
import argparse
import json
from pathlib import Path

import numpy as np
import open3d as o3d
import matplotlib.pyplot as plt
import pyransac3d as pyrsc
from sklearn.neighbors import NearestNeighbors
from sklearn.cluster import DBSCAN
import torch

torch.backends.cudnn.benchmark = True

# Add scan2bim to path
sys.path.insert(0, r'C:\Users\iamsa\Downloads\scan2bim')

from model.bimnet import BIMNet

ID_TO_NAME = {
    0: "ceiling",
    1: "floor",
    2: "wall",
    3: "beam",
    4: "column",
    5: "window",
    6: "door",
    7: "unassigned",
}


def load_point_cloud(file_path: Path) -> o3d.geometry.PointCloud:
    if file_path.suffix in ['.ply', '.pcd']:
        pcd = o3d.io.read_point_cloud(str(file_path))
    else:
        raise ValueError(f"Unsupported file format: {file_path.suffix}")
    print(f"Loaded {len(pcd.points)} points")
    return pcd


def separate_by_label(pcd: o3d.geometry.PointCloud, point_labels: np.ndarray):
    points = np.asarray(pcd.points)
    colors = np.asarray(pcd.colors)

    separated = {}
    for class_id, class_name in ID_TO_NAME.items():
        mask = (point_labels == class_id)
        if not np.any(mask):
            continue

        class_pcd = o3d.geometry.PointCloud()
        class_pcd.points = o3d.utility.Vector3dVector(points[mask])
        class_pcd.colors = o3d.utility.Vector3dVector(colors[mask])
        separated[class_name] = class_pcd
        print(f"  {class_name}: {mask.sum()} points")

    return separated


def smooth_labels_knn(pcd: o3d.geometry.PointCloud, labels: np.ndarray, k: int = 5) -> np.ndarray:
    points = np.asarray(pcd.points)
    nbrs = NearestNeighbors(n_neighbors=k, algorithm='kd_tree', n_jobs=-1).fit(points)
    _, indices = nbrs.kneighbors(points)
    neighbor_labels = labels[indices]

    try:
        from scipy.stats import mode
        vote_result = mode(neighbor_labels, axis=1, keepdims=False)
        return vote_result[0]
    except Exception:
        new_labels = np.zeros_like(labels)
        for i in range(len(labels)):
            counts = np.bincount(neighbor_labels[i])
            new_labels[i] = np.argmax(counts)
        return new_labels


def instantiate_with_dbscan(pcd: o3d.geometry.PointCloud, class_name: str, eps=0.1, min_points=100):
    if len(pcd.points) == 0:
        return []

    points = np.asarray(pcd.points)
    colors = np.asarray(pcd.colors)

    print(f"Clustering {class_name} with DBSCAN...")
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
    for class_name, instances in instances_dict.items():
        thresh = min_points_thresholds.get(class_name, 500)
        valid_instances = [pcd for pcd in instances if len(pcd.points) >= thresh]
        cleaned_dict[class_name] = valid_instances
    return cleaned_dict


def save_instances(instances_dict, output_dir: Path, combined_name: str):
    output_dir.mkdir(parents=True, exist_ok=True)

    for class_name, instances in instances_dict.items():
        class_dir = output_dir / class_name
        class_dir.mkdir(exist_ok=True)
        for i, instance in enumerate(instances):
            filename = class_dir / f"{class_name}_instance_{i:03d}.ply"
            o3d.io.write_point_cloud(str(filename), instance)

    summary = {class_name: len(instances) for class_name, instances in instances_dict.items()}
    with open(output_dir / "instantiation_summary.json", 'w') as f:
        json.dump(summary, f, indent=2)

    combined_pc = o3d.geometry.PointCloud()
    for instances in instances_dict.values():
        for instance in instances:
            combined_pc += instance

    combined_filename = output_dir / combined_name
    o3d.io.write_point_cloud(str(combined_filename), combined_pc)
    print(f"Combined point cloud saved to {combined_filename}")
    return combined_filename


def maybe_downsample(pcd, voxel_size):
    if voxel_size <= 0:
        return pcd
    return pcd.voxel_down_sample(voxel_size=voxel_size)


def finetune_model(checkpoint_path, device, num_new_classes):
    state_old = torch.load(checkpoint_path, map_location=device)
    model_new = BIMNet(num_classes=num_new_classes)
    state_new = model_new.state_dict()

    for k, v in state_old.items():
        if k in state_new and state_new[k].shape == v.shape:
            state_new[k] = v

    model_new.load_state_dict(state_new)
    model_new.to(device)
    model_new.eval()
    return model_new


def build_models(checkpoint_paths, device, num_classes=8):
    models = []
    for ckpt in checkpoint_paths:
        print(f"Loading checkpoint: {ckpt}")
        model = finetune_model(ckpt, device, num_new_classes=num_classes)
        models.append(model)
    return models


def voxelize_points(points, cube_edge):
    points_centered = points - points.mean(axis=0)
    max_val = np.abs(points_centered).max() + 1e-8
    points_norm = points_centered / max_val
    points_shifted = points_norm + 1.0
    scale_factor = cube_edge // 2
    points_grid = np.round(points_shifted * scale_factor).astype(np.int32)
    points_grid = np.clip(points_grid, 0, cube_edge - 1)

    vox = np.zeros((1, cube_edge, cube_edge, cube_edge), dtype=np.float32)
    vox[0, points_grid[:, 0], points_grid[:, 1], points_grid[:, 2]] = 1.0
    return vox, points_grid


def color_label(labels, num_classes=8):
    cmap = plt.get_cmap("tab20", num_classes)
    flat = labels.flatten()
    colors = cmap(flat % num_classes)[:, :3]
    return colors.reshape((*labels.shape, 3))


def run_bimnet_inference(pcd, models, cube_edge=128, num_classes=8, device="cuda"):
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
    return pcd, point_labels


def instantiate_planar_iterative(pcd, class_name, dist_thresh=0.20, min_points=500):
    remaining_pcd = pcd
    instances = []

    print(f"Iterative RANSAC for {class_name} (Thresh={dist_thresh})...")

    while len(remaining_pcd.points) > min_points:
        points = np.asarray(remaining_pcd.points)
        plane = pyrsc.Plane()
        _, inliers = plane.fit(points, thresh=dist_thresh, minPoints=100, maxIteration=1000)

        if len(inliers) < min_points:
            break

        inst_pcd = remaining_pcd.select_by_index(inliers)
        instances.append(inst_pcd)
        remaining_pcd = remaining_pcd.select_by_index(inliers, invert=True)
        print(f"  Found instance {len(instances)}: {len(inliers)} points. Remaining: {len(remaining_pcd.points)}")

    return instances


def main(args):
    device = "cpu" if args.cpu else ("cuda" if torch.cuda.is_available() else "cpu")
    input_path = Path(args.input_file)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Point Cloud Instantiation Workflow (BIMNet + DBSCAN)")
    print("=" * 60)

    pcd = load_point_cloud(input_path)

    print("Loading BIMNet models...")
    models = build_models(args.checkpoint, device, num_classes=args.num_classes)

    print("Running BIMNet inference...")
    pcd, preds_volume, points_grid, point_labels = run_bimnet_inference(
        pcd, models, cube_edge=args.cube_edge, num_classes=args.num_classes, device=device
    )

    # --- NEW STEP: SMOOTH LABELS ---
    point_count = len(pcd.points)
    if point_count > 500000:
        print(
            f"\nStep 0.5: Skipping KNN smoothing because point count "
            f"({point_count}) exceeds 500000."
        )
        print("Use --smooth-max-points with a higher value to force smoothing.")
    else:
        print(f"\nStep 0.5: Smoothing predictions with KNN (k=15)...")
        point_labels = smooth_labels_knn(pcd, point_labels, k=15)

    print("\nStep 1: Separating point cloud by semantic class...")
    separated_classes = separate_by_label(pcd, point_labels)

    if not separated_classes:
        print("Warning: No classes found! Check your color mappings.")
        return 1

    print("\nStep 2: Instantiating classes...")
    all_instances = {}

    planar_classes = ['wall', 'floor', 'ceiling']
    dbscan_params = {
        'beam': {'eps': 0.1, 'min_points': 150},
        'column': {'eps': 0.1, 'min_points': 125},
        'window': {'eps': 0.05, 'min_points': 150},
        'door': {'eps': 0.07, 'min_points': 200},
        'unassigned': {'eps': 0.05, 'min_points': 200},
    }

    # Apply stronger smoothing before instance extraction
    print("Applying strong smoothing (KNN, k=15)...")
    point_labels = smooth_labels_knn(pcd, point_labels, k=15)
    separated_classes = separate_by_label(pcd, point_labels)

    for class_name, class_pcd in separated_classes.items():
        if class_name in planar_classes:
            instances = instantiate_planar_iterative(class_pcd, class_name, dist_thresh=0.15, min_points=2000)
        else:
            params = dbscan_params.get(class_name, {'eps': 0.1, 'min_points': 100})
            instances = instantiate_with_dbscan(
                class_pcd,
                class_name,
                eps=params['eps'],
                min_points=params['min_points'],
            )
        all_instances[class_name] = instances

    cleaning_thresholds = {
        'ceiling': 2000,
        'floor': 2000,
        'wall': 1000,
        'beam': 500,
        'column': 500,
        'door': 500,
        'window': 200,
        # 'unassigned': 100,
    }

    all_instances = filter_small_instances(all_instances, cleaning_thresholds)

    print("\nStep 3: Saving instances...")
    if args.voxel_size > 0:
        for class_name, instances in all_instances.items():
            all_instances[class_name] = [maybe_downsample(pcd, args.voxel_size) for pcd in instances]
    save_instances(all_instances, output_dir, args.output_name)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BIMNet semantic segmentation + DBSCAN instance extraction")
    parser.add_argument("--input_file", required=True, help="Path to input point cloud (.ply/.pcd)")
    parser.add_argument("--output_dir", required=True, help="Directory to save instance PLYs")
    parser.add_argument("--checkpoint", action="append", default=[], help="Path(s) to BIMNet checkpoint(s)")
    parser.add_argument("--cube_edge", type=int, default=96, help="Voxel grid edge length")
    parser.add_argument("--num_classes", type=int, default=8, help="Number of BIMNet output classes")
    parser.add_argument("--output_name", default="all_instances_combined.ply", help="Combined output filename")
    parser.add_argument("--voxel_size", type=float, default=0.02, help="Downsample voxel size (0 to disable)")
    parser.add_argument("--cpu", action="store_true", help="Force CPU")

    args = parser.parse_args()
    if not args.checkpoint:
        print("Error: At least one --checkpoint is required")
        sys.exit(1)

    sys.exit(main(args))
