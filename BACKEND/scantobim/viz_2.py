import numpy as np
import open3d as o3d
from tqdm import tqdm
import matplotlib.pyplot as plt
import pyransac3d as pyrsc
import colorsys
from sklearn.neighbors import NearestNeighbors

import torch
torch.backends.cudnn.benchmark = True
from torch.nn import CrossEntropyLoss
from torch.optim import Adam
from torch.utils.data import DataLoader

from model.segcloud import SegCloud
from model.bimnet import BIMNet
from dataloaders.PCSdataset import PCSDataset
from dataloaders.S3DISdataset import S3DISDataset

from sklearn.cluster import DBSCAN
from sklearn.decomposition import PCA
import json
from pathlib import Path
from matplotlib.colors import to_rgb
import argparse

MAX_INPUT_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024
MAX_INPUT_FILE_SIZE_LABEL = "2 GB"
SUPPORTED_INPUT_SUFFIXES = {".ply", ".pcd"}

ID_TO_NAME = {
    0: "ceiling",
    1: "floor",
    2: "wall",
    3: "beam",
    4: "column",
    5: "window",
    6: "door",
}

def format_file_size(num_bytes):
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024.0 or unit == "TB":
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.2f} {unit}"
        size /= 1024.0

def validate_input_file(file_path):
    file_path = Path(file_path)

    if not file_path.exists():
        raise FileNotFoundError(f"Input file not found: {file_path}")
    if not file_path.is_file():
        raise ValueError(f"Input path is not a file: {file_path}")

    suffix = file_path.suffix.lower()
    if suffix not in SUPPORTED_INPUT_SUFFIXES:
        supported = ", ".join(sorted(SUPPORTED_INPUT_SUFFIXES))
        raise ValueError(f"Unsupported file format: {file_path.suffix}. Expected one of: {supported}")

    file_size = file_path.stat().st_size
    print(f"Input file size: {format_file_size(file_size)}")
    if file_size > MAX_INPUT_FILE_SIZE_BYTES:
        raise ValueError(
            f"Input file exceeds the {MAX_INPUT_FILE_SIZE_LABEL} limit "
            f"({format_file_size(file_size)})."
        )

    return file_path

def load_point_cloud(file_path):
    file_path = validate_input_file(file_path)
    print(f"Loading point cloud from: {file_path}")
    
    if file_path.suffix.lower() in SUPPORTED_INPUT_SUFFIXES:
        pcd = o3d.io.read_point_cloud(str(file_path))
    else:
        raise ValueError(f"Unsupported file format: {file_path.suffix}")
    
    print(f"Loaded {len(pcd.points)} points")
    return pcd

def get_device_point_budget(device):
    if device == "cpu":
        return 350000

    if device.startswith("cuda") and torch.cuda.is_available():
        try:
            total_memory_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            if total_memory_gb < 6:
                return 450000
            if total_memory_gb < 8:
                return 650000
            return 900000
        except Exception:
            return 700000

    return 500000

def auto_downsample_for_device(pcd, device):
    point_count = len(pcd.points)
    point_budget = get_device_point_budget(device)
    if point_count <= point_budget:
        print(f"Auto-downsampling skipped: {point_count} points within {device} budget ({point_budget}).")
        return pcd, False

    stride = max(2, int(np.ceil(point_count / point_budget)))
    print(
        f"Auto-downsampling for {device}: reducing {point_count} points "
        f"toward budget {point_budget} using every {stride}th point."
    )
    reduced = pcd.uniform_down_sample(stride)
    if len(reduced.points) < 1000:
        print("Auto-downsampling skipped: reduced cloud would be too small.")
        return pcd, False

    print(f"Downsampled to {len(reduced.points)} points for {device} processing.")
    return reduced, True

def adapt_dbscan_min_points(min_points, scale_factor):
    if min_points <= 0:
        return min_points
    if scale_factor <= 1.0:
        return int(min_points)

    relaxed = int(round(min_points / min(scale_factor ** 0.5, 2.0)))
    return max(10, relaxed)

def rotation_matrix_from_vectors(source, target):
    source = np.asarray(source, dtype=np.float64)
    target = np.asarray(target, dtype=np.float64)
    source /= np.linalg.norm(source) + 1e-12
    target /= np.linalg.norm(target) + 1e-12

    v = np.cross(source, target)
    c = np.clip(np.dot(source, target), -1.0, 1.0)
    s = np.linalg.norm(v)

    if s < 1e-8:
        if c > 0:
            return np.eye(3, dtype=np.float64)
        # 180-degree flip around any axis orthogonal to source
        ortho = np.array([1.0, 0.0, 0.0], dtype=np.float64)
        if abs(source[0]) > 0.9:
            ortho = np.array([0.0, 1.0, 0.0], dtype=np.float64)
        axis = np.cross(source, ortho)
        axis /= np.linalg.norm(axis) + 1e-12
        K = np.array([
            [0.0, -axis[2], axis[1]],
            [axis[2], 0.0, -axis[0]],
            [-axis[1], axis[0], 0.0],
        ])
        return np.eye(3, dtype=np.float64) + 2.0 * (K @ K)

    K = np.array([
        [0.0, -v[2], v[1]],
        [v[2], 0.0, -v[0]],
        [-v[1], v[0], 0.0],
    ])
    return np.eye(3, dtype=np.float64) + K + K @ K * ((1.0 - c) / (s ** 2))

def align_point_cloud_z_up(pcd, distance_threshold=0.05):
    if len(pcd.points) < 100:
        return pcd, False

    sample_pcd = pcd
    if len(pcd.points) > 100000:
        sample_pcd = pcd.voxel_down_sample(voxel_size=0.03)
        if len(sample_pcd.points) < 100:
            sample_pcd = pcd

    try:
        plane_model, inliers = sample_pcd.segment_plane(
            distance_threshold=distance_threshold,
            ransac_n=3,
            num_iterations=1500,
        )
    except Exception as exc:
        print(f"Z-up alignment skipped: plane estimation failed ({exc}).")
        return pcd, False

    if len(inliers) < 100:
        print("Z-up alignment skipped: no dominant plane found.")
        return pcd, False

    normal = np.asarray(plane_model[:3], dtype=np.float64)
    normal /= np.linalg.norm(normal) + 1e-12
    if normal[2] < 0:
        normal = -normal

    target = np.array([0.0, 0.0, 1.0], dtype=np.float64)
    tilt_deg = float(np.degrees(np.arccos(np.clip(np.dot(normal, target), -1.0, 1.0))))
    if tilt_deg < 2.0:
        print(f"Z-up alignment skipped: dominant plane already within {tilt_deg:.2f} deg of horizontal.")
        return pcd, False

    rotation = rotation_matrix_from_vectors(normal, target)
    aligned = o3d.geometry.PointCloud(pcd)
    center = np.asarray(aligned.get_center(), dtype=np.float64)
    aligned.rotate(rotation, center=center)
    print(f"Applied Z-up alignment using dominant plane normal {normal.round(4)} (tilt={tilt_deg:.2f} deg).")
    return aligned, True

def estimate_point_spacing(pcd, sample_size=20000):
    points = np.asarray(pcd.points, dtype=np.float32)
    if len(points) < 2:
        return 0.02

    if len(points) > sample_size:
        rng = np.random.default_rng(42)
        sample_idx = rng.choice(len(points), size=sample_size, replace=False)
        sample = points[sample_idx]
    else:
        sample = points

    nbrs = NearestNeighbors(n_neighbors=2, algorithm='kd_tree', n_jobs=-1).fit(points)
    distances, _ = nbrs.kneighbors(sample)
    spacing = float(np.median(distances[:, 1]))
    return max(spacing, 1e-3)

def auto_tune_parameters(pcd):
    n_points = len(pcd.points)
    bbox = pcd.get_axis_aligned_bounding_box()
    extent = np.asarray(bbox.get_extent(), dtype=np.float32)
    scene_scale = float(np.max(extent)) if extent.size else 0.0
    spacing = estimate_point_spacing(pcd)

    smoothing_k = 5 if n_points > 900000 else 7
    wall_ransac_thresh = min(max(spacing * 3.0, 0.04), 0.18)
    floor_ceiling_ransac_thresh = min(max(spacing * 2.0, 0.03), 0.14)

    dbscan_params = {
        'beam': {
            'eps': min(max(spacing * 4.0, 0.08), 0.35),
            'min_points': 60 if scene_scale < 20 else 80,
        },
        'column': {
            'eps': min(max(spacing * 5.0, 0.10), 0.40),
            'min_points': 90 if scene_scale < 20 else 120,
        },
        'window': {
            'eps': min(max(spacing * 2.5, 0.05), 0.18),
            'min_points': 20 if n_points < 500000 else 30,
        },
        'door': {
            'eps': min(max(spacing * 3.5, 0.08), 0.30),
            'min_points': 60 if n_points < 500000 else 80,
        },
    }

    config = {
        'spacing': spacing,
        'smoothing_k': smoothing_k,
        'wall_ransac_thresh': wall_ransac_thresh,
        'floor_ceiling_ransac_thresh': floor_ceiling_ransac_thresh,
        'dbscan_params': dbscan_params,
    }

    print("\nAuto-tuned parameters from input cloud:")
    print(f"  points: {n_points}")
    print(f"  estimated spacing: {spacing:.4f}")
    print(f"  smoothing_k: {smoothing_k}")
    print(f"  wall_ransac_thresh: {wall_ransac_thresh:.4f}")
    print(f"  floor_ceiling_ransac_thresh: {floor_ceiling_ransac_thresh:.4f}")
    for class_name, params in dbscan_params.items():
        print(f"  DBSCAN {class_name}: eps={params['eps']:.4f}, min_points={params['min_points']}")

    return config

def separate_by_label(pcd, point_labels):
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

def combine_point_clouds(pcd_list):
    combined = o3d.geometry.PointCloud()
    for pcd in pcd_list:
        if pcd is None or len(pcd.points) == 0:
            continue
        combined += pcd
    return combined

def scale_point_cloud(pcd, scale_factor, center=None):
    if pcd is None or len(pcd.points) == 0 or abs(scale_factor - 1.0) < 1e-8:
        return o3d.geometry.PointCloud(pcd) if pcd is not None else o3d.geometry.PointCloud()

    scaled = o3d.geometry.PointCloud(pcd)
    center = np.zeros(3, dtype=np.float64) if center is None else np.asarray(center, dtype=np.float64)
    scaled.scale(float(scale_factor), center=center)
    return scaled

def scale_instances_dict(instances_dict, scale_factor, center=None):
    scaled_dict = {}
    for class_name, instances in instances_dict.items():
        scaled_dict[class_name] = [scale_point_cloud(instance, scale_factor, center=center) for instance in instances]
    return scaled_dict

def estimate_scene_scale_factor(separated_classes, target_room_height=2.7, canonical_height_range=(1.8, 4.5)):
    floor_pcd = separated_classes.get('floor')
    ceiling_pcd = separated_classes.get('ceiling')
    if floor_pcd is None or ceiling_pcd is None or len(floor_pcd.points) == 0 or len(ceiling_pcd.points) == 0:
        return 1.0, None

    floor_pts = np.asarray(floor_pcd.points, dtype=np.float32)
    ceiling_pts = np.asarray(ceiling_pcd.points, dtype=np.float32)
    floor_z = float(np.percentile(floor_pts[:, 2], 50))
    ceiling_z = float(np.percentile(ceiling_pts[:, 2], 50))
    estimated_height = abs(ceiling_z - floor_z)
    if estimated_height < 1e-6:
        return 1.0, None

    low, high = canonical_height_range
    if low <= estimated_height <= high:
        return 1.0, estimated_height

    scale_factor = target_room_height / estimated_height
    return scale_factor, estimated_height

def smooth_labels_knn(pcd, labels, k=5, protected_classes=None):
    """
    Majority-vote label smoothing with an option to protect large planar classes.
    On real scans, aggressive smoothing can bleed wall/column labels into nearby
    clutter, so ceiling/floor/wall/column are left unchanged by default.
    """
    protected_classes = {0, 1, 2, 4} if protected_classes is None else set(protected_classes)
    print(f"Smoothing labels with KNN (k={k}, protected={sorted(protected_classes)})...")
    points = np.asarray(pcd.points, dtype=np.float32)

    nbrs = NearestNeighbors(n_neighbors=k, algorithm='kd_tree', n_jobs=-1).fit(points)
    new_labels = labels.copy()
    chunk_size = 50000

    from scipy.stats import mode
    try:
        mask = ~np.isin(labels, list(protected_classes))
        for start in tqdm(range(0, len(labels), chunk_size), desc="Smoothing"):
            end = min(start + chunk_size, len(labels))
            _, indices = nbrs.kneighbors(points[start:end])
            neighbor_labels = labels[indices]
            vote_result = mode(neighbor_labels, axis=1, keepdims=False)
            voted = np.asarray(vote_result[0]).reshape(-1)
            chunk_mask = mask[start:end]
            new_labels[start:end][chunk_mask] = voted[chunk_mask]
    except Exception:
        for start in tqdm(range(0, len(labels), chunk_size), desc="Voting"):
            end = min(start + chunk_size, len(labels))
            _, indices = nbrs.kneighbors(points[start:end])
            neighbor_labels = labels[indices]
            for offset, label in enumerate(labels[start:end]):
                if label in protected_classes:
                    continue
                counts = np.bincount(neighbor_labels[offset], minlength=len(ID_TO_NAME))
                new_labels[start + offset] = np.argmax(counts)

    return new_labels

def instantiate_columns_fast(pcd, eps=0.1, min_points=100):
    if len(pcd.points) == 0:
        return []

    _, ind = pcd.remove_statistical_outlier(nb_neighbors=12, std_ratio=2.5)
    pcd = pcd.select_by_index(ind)
    points = np.asarray(pcd.points, dtype=np.float32)
    if len(points) == 0:
        return []

    cluster_source = pcd
    voxel_size = max(eps * 0.4, 0.01)
    if len(points) > 40000:
        cluster_source = pcd.voxel_down_sample(voxel_size=voxel_size)

    cluster_points = np.asarray(cluster_source.points, dtype=np.float32)
    if len(cluster_points) == 0:
        return []

    xy_features = cluster_points[:, :2]
    scaled_min_points = max(10, min_points // 3) if len(points) > len(cluster_points) else min_points

    print(f"\nClustering column with fast DBSCAN in XY...")
    clustering = DBSCAN(eps=eps, min_samples=scaled_min_points, n_jobs=-1).fit(xy_features)
    cluster_labels = clustering.labels_

    valid_cluster_ids = sorted(label for label in np.unique(cluster_labels) if label != -1)
    print(f"  Found {len(valid_cluster_ids)} candidate column instances")
    if not valid_cluster_ids:
        return []

    if len(points) > len(cluster_points):
        original_xy = points[:, :2]
        point_cluster_ids = np.full(len(points), -1, dtype=np.int32)
        chunk_size = 50000
        for label_id in valid_cluster_ids:
            cluster_xy = xy_features[cluster_labels == label_id]
            if len(cluster_xy) == 0:
                continue

            nbrs = NearestNeighbors(n_neighbors=1, algorithm='kd_tree', n_jobs=-1).fit(cluster_xy)
            assign_radius = max(eps * 0.7, voxel_size * 1.5)

            for start in range(0, len(points), chunk_size):
                end = min(start + chunk_size, len(points))
                chunk_xy = original_xy[start:end]
                distances, _ = nbrs.kneighbors(chunk_xy)
                within_mask = distances[:, 0] <= assign_radius

                chunk_ids = point_cluster_ids[start:end]
                chunk_ids[within_mask] = label_id
                point_cluster_ids[start:end] = chunk_ids
    else:
        point_cluster_ids = cluster_labels

    instances = []
    for label_id in valid_cluster_ids:
        instance_idx = np.where(point_cluster_ids == label_id)[0]
        if len(instance_idx) < min_points:
            continue
        instance_pcd = pcd.select_by_index(instance_idx)
        if is_valid_geometry(instance_pcd, 'column'):
            instances.append(instance_pcd)

    print(f"  Retained {len(instances)} valid column instances")
    return instances

def instantiate_with_dbscan(pcd, class_name, eps=0.1, min_points=100):
    if len(pcd.points) == 0:
        return []
    if class_name == 'column':
        return instantiate_columns_fast(pcd, eps=eps, min_points=min_points)

    _, ind = pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)
    pcd = pcd.select_by_index(ind)
    points = np.asarray(pcd.points, dtype=np.float32)
    
    print(f"\nClustering {class_name} with DBSCAN...")
    feature_points = points[:, :2] if class_name in {'door', 'window'} else points
    clustering = DBSCAN(eps=eps, min_samples=min_points, n_jobs=-1).fit(feature_points)
    labels = clustering.labels_
    
    unique_labels = set(labels)
    n_clusters = len(unique_labels) - (1 if -1 in labels else 0)
    
    print(f"  Found {n_clusters} instances")
    
    instances = []
    for label_id in unique_labels:
        if label_id == -1:
            continue
        instance_mask = labels == label_id
        instance_pcd = pcd.select_by_index(np.where(instance_mask)[0])
        
        if is_valid_geometry(instance_pcd, class_name):
            instances.append(instance_pcd)
    
    return instances

def is_valid_geometry(pcd, class_name):
    """Geometry validation is currently disabled, so all clusters are kept."""
    return True

def save_instances(instances_dict, output_dir):
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    colored_instances_dict = colorize_instances_globally(instances_dict)
    
    for class_name, instances in colored_instances_dict.items():
        class_dir = output_path / class_name
        class_dir.mkdir(exist_ok=True)
        
        for i, instance in enumerate(instances):
            filename = class_dir / f"{class_name}_instance_{i:03d}.ply"
            o3d.io.write_point_cloud(str(filename), instance)
        
    summary = {
        class_name: len(instances) 
        for class_name, instances in instances_dict.items()
    }
    
    with open(output_path / "instantiation_summary.json", 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\nSummary saved to {output_path / 'instantiation_summary.json'}")

    combined_pc = o3d.geometry.PointCloud()
    for class_name, instances in colored_instances_dict.items():
        for instance in instances:
            combined_pc += instance
    
    combined_filename = output_path / "all_instances_combined.ply"
    o3d.io.write_point_cloud(str(combined_filename), combined_pc)
    print(f"Combined point cloud saved to {combined_filename}")

def generate_distinct_colors(n_colors):
    if n_colors <= 0:
        return []

    if n_colors <= 20:
        try:
            cmap = plt.colormaps['tab20']
        except (AttributeError, KeyError):
            cmap = plt.cm.get_cmap('tab20')

        denominator = max(n_colors - 1, 1)
        return [cmap(i / denominator)[:3] for i in range(n_colors)]

    colors = []
    golden_ratio = 0.618033988749895
    hue = 0.0
    for i in range(n_colors):
        hue = (hue + golden_ratio) % 1.0
        saturation = 0.65 + 0.1 * (i % 3) / 2.0
        value = 0.9 - 0.08 * (i % 2)
        colors.append(colorsys.hsv_to_rgb(hue, saturation, value))
    return colors

def colorize_instances_globally(instances_dict):
    total_instances = sum(len(instances) for instances in instances_dict.values())
    palette = generate_distinct_colors(total_instances)

    colored_instances = {}
    color_index = 0
    for class_name, instances in instances_dict.items():
        class_instances = []
        for instance in instances:
            colored_pcd = o3d.geometry.PointCloud(instance)
            if len(instance.points) > 0:
                instance_color = np.tile(palette[color_index], (len(instance.points), 1))
                colored_pcd.colors = o3d.utility.Vector3dVector(instance_color)
            class_instances.append(colored_pcd)
            color_index += 1
        colored_instances[class_name] = class_instances

    return colored_instances

def visualize_instances(instances_dict, show_by_class=True):
    colored_instances_dict = colorize_instances_globally(instances_dict)

    if show_by_class:
        for class_name, instances in colored_instances_dict.items():
            if len(instances) == 0:
                continue
            
            print(f"\nVisualizing {class_name} instances ({len(instances)} instances)...")
            o3d.visualization.draw_geometries(
                instances,
                window_name=f"{class_name} - {len(instances)} Instances",
                width=1024,
                height=768
            )
    else:
        print("\nVisualizing all instances from all classes...")
        all_colored_instances = []
        for class_name, instances in colored_instances_dict.items():
            if len(instances) == 0:
                continue
            all_colored_instances.extend(instances)
        
        if all_colored_instances:
            o3d.visualization.draw_geometries(
                all_colored_instances,
                window_name="All Instances",
                width=1024,
                height=768
            )

def visualize_summary(instances_dict, separated_classes, original_pcd):
    print("\n" + "=" * 60)
    print("VISUALIZATION MODE")
    print("=" * 60)
    
    if separated_classes:
        o3d.visualization.draw_geometries(
            list(separated_classes.values()),
            window_name="Semantic Classes",
            width=800,
            height=600
        )
    
    if instances_dict:
        visualize_instances(instances_dict, show_by_class=False)

    print("\n" + "=" * 60)
    response = input("Would you like to see all instances from all classes separately? (y/n): ")
    if response.lower() == 'y':
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

def instantiate_oriented_planes(
    pcd,
    class_name,
    dist_thresh=0.12,
    min_points=300,
    max_instances=12,
    orientation='vertical',
    normal_z_max_for_vertical=0.35,
    normal_z_min_for_horizontal=0.9,
):
    if len(pcd.points) < min_points:
        return []

    remaining_pcd = pcd
    instances = []
    rejected_count = 0
    skipped_wrong_orientation = 0
    print(f"\nOriented RANSAC for {class_name} (Thresh={dist_thresh}, orientation={orientation})...")

    while len(remaining_pcd.points) > min_points and len(instances) < max_instances:
        points = np.asarray(remaining_pcd.points, dtype=np.float32)
        if len(points) < min_points:
            break

        segment_pcd = remaining_pcd
        if len(points) > 80000:
            voxel_size = max(dist_thresh * 0.6, 0.03)
            segment_pcd = remaining_pcd.voxel_down_sample(voxel_size=voxel_size)
            if len(segment_pcd.points) < min_points:
                segment_pcd = remaining_pcd

        try:
            plane_model, _ = segment_pcd.segment_plane(
                distance_threshold=dist_thresh,
                ransac_n=3,
                num_iterations=1500,
            )
        except Exception:
            break

        normal = np.asarray(plane_model[:3], dtype=np.float32)
        normal_norm = np.linalg.norm(normal) + 1e-8
        normal_z = abs(normal[2]) / normal_norm
        distances = np.abs(points @ normal + plane_model[3]) / normal_norm
        inliers = np.where(distances <= dist_thresh)[0]
        if len(inliers) < min_points:
            break

        if orientation == 'vertical' and normal_z > normal_z_max_for_vertical:
            skipped_wrong_orientation += 1
            remaining_pcd = remaining_pcd.select_by_index(inliers, invert=True)
            continue

        if orientation == 'horizontal' and normal_z < normal_z_min_for_horizontal:
            skipped_wrong_orientation += 1
            remaining_pcd = remaining_pcd.select_by_index(inliers, invert=True)
            continue

        inst_pcd = remaining_pcd.select_by_index(inliers)
        is_valid, reason = explain_planar_instance(inst_pcd, class_name)
        if not is_valid:
            rejected_count += 1
            remaining_pcd = remaining_pcd.select_by_index(inliers, invert=True)
            continue

        color = generate_distinct_colors(len(instances) + 1)[-1]
        inst_pcd.paint_uniform_color(color)
        instances.append(inst_pcd)

        remaining_pcd = remaining_pcd.select_by_index(inliers, invert=True)
        print(f"  Found {class_name} instance {len(instances)}: {len(inliers)} points.")

    return instances

def oriented_line_from_wall_points(pts_xy):
    pca = PCA(n_components=2)
    pca.fit(pts_xy)
    direction = pca.components_[0]
    direction = direction / (np.linalg.norm(direction) + 1e-8)
    center = np.median(pts_xy, axis=0)
    rel = pts_xy - center
    projections = rel @ direction
    p_min, p_max = np.percentile(projections, 5), np.percentile(projections, 95)
    start = center + direction * p_min
    end = center + direction * p_max
    normal = np.array([-direction[1], direction[0]])
    offsets = rel @ normal
    thickness = max(np.percentile(np.abs(offsets), 90) * 2.0, 0.05)
    return {
        'direction': direction,
        'center': center,
        'start': start,
        'end': end,
        'normal': normal,
        'thickness': float(thickness),
        'length': float(max(p_max - p_min, 0.0)),
        'offset_median': float(np.median(rel @ normal)),
    }

def explain_planar_instance(pcd, class_name):
    """Planar validation is currently disabled, so all planar instances are accepted."""
    return True, "ok"

def merge_collinear_walls(wall_instances, dist_tolerance=0.2, angle_tolerance_deg=8.0, gap_tolerance=0.6):
    """
    Merge wall fragments only when they are nearly parallel, lie on the same line,
    and overlap or almost touch along their dominant direction.
    """
    if not wall_instances:
        return []

    metas = []
    for inst in wall_instances:
        pts = np.asarray(inst.points)
        if len(pts) < 100:
            continue
        xy = pts[:, :2]
        line = oriented_line_from_wall_points(xy)
        z_min = np.percentile(pts[:, 2], 5)
        z_max = np.percentile(pts[:, 2], 95)
        metas.append({
            'pcd': inst,
            'xy': xy,
            'line': line,
            'z_min': float(z_min),
            'z_max': float(z_max),
        })

    if not metas:
        return []

    parent = list(range(len(metas)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    angle_tolerance = np.deg2rad(angle_tolerance_deg)

    for i in range(len(metas)):
        li = metas[i]['line']
        for j in range(i + 1, len(metas)):
            lj = metas[j]['line']

            cosang = np.clip(np.abs(np.dot(li['direction'], lj['direction'])), -1.0, 1.0)
            angle = np.arccos(cosang)
            if angle > angle_tolerance:
                continue

            mean_dir = li['direction']
            mean_normal = np.array([-mean_dir[1], mean_dir[0]])
            center_delta = metas[j]['line']['center'] - metas[i]['line']['center']
            lateral_dist = abs(np.dot(center_delta, mean_normal))
            if lateral_dist > max(dist_tolerance, 0.5 * (li['thickness'] + lj['thickness'])):
                continue

            ci = metas[i]['xy'].mean(axis=0)
            proj_i = (metas[i]['xy'] - ci) @ mean_dir
            proj_j = (metas[j]['xy'] - ci) @ mean_dir
            i0, i1 = np.percentile(proj_i, 5), np.percentile(proj_i, 95)
            j0, j1 = np.percentile(proj_j, 5), np.percentile(proj_j, 95)
            overlap = min(i1, j1) - max(i0, j0)
            gap = max(j0 - i1, i0 - j1, 0.0)
            if overlap < -gap_tolerance and gap > gap_tolerance:
                continue

            z_overlap = min(metas[i]['z_max'], metas[j]['z_max']) - max(metas[i]['z_min'], metas[j]['z_min'])
            if z_overlap < -0.2:
                continue

            union(i, j)

    grouped = {}
    for idx, meta in enumerate(metas):
        root = find(idx)
        grouped.setdefault(root, []).append(meta['pcd'])

    merged = []
    for members in grouped.values():
        combined = o3d.geometry.PointCloud()
        for inst in members:
            combined += inst
        merged.append(combined)

    print(f"  Merged {len(wall_instances)} wall segments into {len(merged)} walls")
    return merged

def remove_wall_like_points_from_columns(column_pcd, wall_instances, scale_factor=1.0):
    if len(column_pcd.points) == 0 or not wall_instances:
        return column_pcd

    points = np.asarray(column_pcd.points, dtype=np.float32)
    keep_mask = np.ones(len(points), dtype=bool)

    for wall in wall_instances:
        wall_pts = np.asarray(wall.points, dtype=np.float32)
        if len(wall_pts) < 100:
            continue

        line = oriented_line_from_wall_points(wall_pts[:, :2])
        wall_z_min = np.percentile(wall_pts[:, 2], 5)
        wall_z_max = np.percentile(wall_pts[:, 2], 95)
        normal = line['normal'] / (np.linalg.norm(line['normal']) + 1e-8)
        rel_xy = points[:, :2] - line['center']
        lateral_dist = np.abs(rel_xy @ normal)
        z_margin = max(0.02 * scale_factor, 0.005)
        z_overlap = (points[:, 2] >= wall_z_min - z_margin) & (points[:, 2] <= wall_z_max + z_margin)
        # Be gentler here: columns commonly touch walls, so only remove points that are
        # extremely close to the wall centerline.
        near_wall = lateral_dist <= max(line['thickness'] * 0.6, 0.01 * scale_factor)
        keep_mask &= ~(z_overlap & near_wall)

    filtered = column_pcd.select_by_index(np.where(keep_mask)[0])
    removed = len(points) - len(filtered.points)
    if removed > 0:
        print(f"  Removed {removed} column-labelled points that hug recovered wall planes")
    return filtered

def fit_plane_model_from_instance(pcd, scale_factor=1.0):
    points = np.asarray(pcd.points, dtype=np.float32)
    if len(points) < 3:
        return None

    sample_pcd = pcd
    if len(points) > 50000:
        sample_pcd = pcd.voxel_down_sample(voxel_size=0.03)
        if len(sample_pcd.points) < 3:
            sample_pcd = pcd

    try:
        plane_model, _ = sample_pcd.segment_plane(
            distance_threshold=max(0.01 * scale_factor, 0.002),
            ransac_n=3,
            num_iterations=1000,
        )
        return np.asarray(plane_model, dtype=np.float32)
    except Exception:
        return None

def remove_points_near_floor_ceiling(structural_pcd, floor_instances, ceiling_instances, margin=0.02, scale_factor=1.0):
    if len(structural_pcd.points) == 0:
        return structural_pcd

    points = np.asarray(structural_pcd.points, dtype=np.float32)
    keep_mask = np.ones(len(points), dtype=bool)

    if floor_instances:
        floor_plane = fit_plane_model_from_instance(floor_instances[0], scale_factor=scale_factor)
        if floor_plane is not None:
            floor_normal = floor_plane[:3]
            floor_norm = np.linalg.norm(floor_normal) + 1e-8
            floor_dist = np.abs(points @ floor_normal + floor_plane[3]) / floor_norm
            keep_mask &= floor_dist > margin
    if ceiling_instances:
        ceiling_plane = fit_plane_model_from_instance(ceiling_instances[0], scale_factor=scale_factor)
        if ceiling_plane is not None:
            ceiling_normal = ceiling_plane[:3]
            ceiling_norm = np.linalg.norm(ceiling_normal) + 1e-8
            ceiling_dist = np.abs(points @ ceiling_normal + ceiling_plane[3]) / ceiling_norm
            keep_mask &= ceiling_dist > margin

    filtered = structural_pcd.select_by_index(np.where(keep_mask)[0])
    removed = len(points) - len(filtered.points)
    if removed > 0:
        print(f"  Removed {removed} structural points within {margin:.3f} m of floor/ceiling before wall recovery")
    return filtered

def retain_vertical_surface_points(pcd, radius=0.12, max_nn=30, vertical_normal_z_max=0.45):
    if len(pcd.points) < 50:
        return pcd

    work_pcd = o3d.geometry.PointCloud(pcd)
    work_pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=radius, max_nn=max_nn)
    )
    normals = np.asarray(work_pcd.normals, dtype=np.float32)
    if len(normals) == 0:
        return pcd

    vertical_mask = np.abs(normals[:, 2]) <= vertical_normal_z_max
    filtered = pcd.select_by_index(np.where(vertical_mask)[0])
    removed = len(pcd.points) - len(filtered.points)
    print(
        f"  Retained {len(filtered.points)} vertical-surface points for wall recovery "
        f"(removed {removed} by normal filtering)"
    )
    return filtered

def remove_non_structural_labels_from_geometry(pcd, separated_classes, scale_factor=1.0):
    if len(pcd.points) == 0:
        return pcd

    subtract_cloud = combine_point_clouds([
        separated_classes.get('window'),
        separated_classes.get('door'),
    ])
    if len(subtract_cloud.points) == 0:
        return pcd

    base_points = np.asarray(pcd.points, dtype=np.float32)
    subtract_points = np.asarray(subtract_cloud.points, dtype=np.float32)
    if len(subtract_points) == 0:
        return pcd

    nbrs = NearestNeighbors(n_neighbors=1, algorithm='kd_tree', n_jobs=-1).fit(subtract_points)
    chunk_size = 50000
    keep_mask = np.ones(len(base_points), dtype=bool)
    removal_radius = max(0.008 * scale_factor, 0.002)

    for start in range(0, len(base_points), chunk_size):
        end = min(start + chunk_size, len(base_points))
        distances, _ = nbrs.kneighbors(base_points[start:end])
        keep_mask[start:end] &= distances[:, 0] > removal_radius

    filtered = pcd.select_by_index(np.where(keep_mask)[0])
    removed = len(base_points) - len(filtered.points)
    if removed > 0:
        print(f"  Removed {removed} raw points near door/window labels before wall recovery")
    return filtered

def refine_instances_with_context(instances, class_name, instances_dict, scale_factor=1.0):
    # Contextual refinement is currently disabled, so return instances unchanged.
    return instances

def instantiate_dominant_plane(pcd, class_name, dist_thresh=0.12):
    """Extract the dominant horizontal floor/ceiling plane only."""
    instances = instantiate_oriented_planes(
        pcd,
        class_name,
        dist_thresh=dist_thresh,
        min_points=50,
        max_instances=1,
        orientation='horizontal',
        normal_z_min_for_horizontal=0.9,
    )
    return instances[:1]

def compute_room_footprint(instances_dict):
    xy_groups = []
    for class_name in ['floor', 'ceiling', 'wall']:
        for pcd in instances_dict.get(class_name, []):
            pts = np.asarray(pcd.points, dtype=np.float32)
            if len(pts) == 0:
                continue
            xy_groups.append(pts[:, :2])

    if not xy_groups:
        return None

    xy = np.vstack(xy_groups)
    q_min = np.percentile(xy, 5, axis=0)
    q_max = np.percentile(xy, 95, axis=0)
    return {
      'min_x': float(q_min[0]),
      'min_y': float(q_min[1]),
      'max_x': float(q_max[0]),
      'max_y': float(q_max[1]),
    }

def line_length_xy(start, end):
    start = np.asarray(start, dtype=np.float32)
    end = np.asarray(end, dtype=np.float32)
    return float(np.linalg.norm(end - start))

def segment_intersection_2d(a0, a1, b0, b1):
    a0 = np.asarray(a0, dtype=np.float32)
    a1 = np.asarray(a1, dtype=np.float32)
    b0 = np.asarray(b0, dtype=np.float32)
    b1 = np.asarray(b1, dtype=np.float32)

    r = a1 - a0
    s = b1 - b0
    rxs = r[0] * s[1] - r[1] * s[0]
    q_p = b0 - a0
    qpxr = q_p[0] * r[1] - q_p[1] * r[0]
    if abs(rxs) < 1e-8 and abs(qpxr) < 1e-8:
        return False
    if abs(rxs) < 1e-8:
        return False
    t = (q_p[0] * s[1] - q_p[1] * s[0]) / rxs
    u = (q_p[0] * r[1] - q_p[1] * r[0]) / rxs
    return 0.0 < t < 1.0 and 0.0 < u < 1.0

def select_perimeter_wall_refs(instances_dict, footprint):
    refs = build_wall_reference_lines(instances_dict, footprint)
    if footprint is None or len(refs) <= 4:
        return refs

    width = max(footprint['max_x'] - footprint['min_x'], 1e-6)
    depth = max(footprint['max_y'] - footprint['min_y'], 1e-6)

    def score_ref(ref, side):
        center = ref['center']
        length = line_length_xy(ref['start'], ref['end'])
        dir_x = abs(ref['direction'][0])
        dir_y = abs(ref['direction'][1])

        if side == 'left':
            if dir_y < dir_x:
                return None
            dist = abs(center[0] - footprint['min_x'])
            span_bonus = length / depth
        elif side == 'right':
            if dir_y < dir_x:
                return None
            dist = abs(center[0] - footprint['max_x'])
            span_bonus = length / depth
        elif side == 'bottom':
            if dir_x < dir_y:
                return None
            dist = abs(center[1] - footprint['min_y'])
            span_bonus = length / width
        else:
            if dir_x < dir_y:
                return None
            dist = abs(center[1] - footprint['max_y'])
            span_bonus = length / width

        return float(dist - 0.15 * span_bonus)

    selected = []
    used_ids = set()
    for side in ['left', 'right', 'bottom', 'top']:
        candidates = []
        for idx, ref in enumerate(refs):
            score = score_ref(ref, side)
            if score is None:
                continue
            candidates.append((score, -line_length_xy(ref['start'], ref['end']), idx, ref))
        if not candidates:
            continue
        candidates.sort()
        _, _, idx, ref = candidates[0]
        if idx not in used_ids:
            selected.append(ref)
            used_ids.add(idx)

    filtered = []
    for ref in selected:
        intersects = False
        for kept in filtered:
            if segment_intersection_2d(ref['start'], ref['end'], kept['start'], kept['end']):
                if line_length_xy(ref['start'], ref['end']) <= line_length_xy(kept['start'], kept['end']):
                    intersects = True
                    break
        if not intersects:
            filtered.append(ref)

    return filtered if filtered else refs

def filter_instances_to_wall_refs(instances_dict, wall_refs):
    if not wall_refs:
        return instances_dict

    wall_instances = instances_dict.get('wall', [])
    if not wall_instances:
        return instances_dict

    kept_walls = []
    used_ref_ids = set()
    for wall in wall_instances:
        pts = np.asarray(wall.points, dtype=np.float32)
        if len(pts) < 50:
            continue
        line = oriented_line_from_wall_points(pts[:, :2])
        start, end = np.asarray(line['start'], dtype=np.float32), np.asarray(line['end'], dtype=np.float32)
        length = line_length_xy(start, end)
        if length < 1e-4:
            continue

        best_idx = None
        best_score = float('inf')
        center = 0.5 * (start + end)
        direction = np.asarray(line['direction'], dtype=np.float32)
        direction = direction / (np.linalg.norm(direction) + 1e-8)
        for idx, ref in enumerate(wall_refs):
            ref_dir = ref['direction'] / (np.linalg.norm(ref['direction']) + 1e-8)
            alignment = abs(float(np.dot(direction, ref_dir)))
            if alignment < 0.8:
                continue
            dist = abs(float(np.dot(center - ref['center'], ref['normal'])))
            score = dist + 0.1 * abs(length - line_length_xy(ref['start'], ref['end']))
            if score < best_score:
                best_score = score
                best_idx = idx

        if best_idx is not None and best_idx not in used_ref_ids:
            kept_walls.append(wall)
            used_ref_ids.add(best_idx)

    if not kept_walls:
        return instances_dict

    filtered = dict(instances_dict)
    filtered['wall'] = kept_walls
    return filtered

def clamp_wall_line_to_room(line, footprint):
    start = np.asarray(line['start'], dtype=np.float32).copy()
    end = np.asarray(line['end'], dtype=np.float32).copy()

    if footprint is None:
        return start, end

    min_x = footprint['min_x']
    min_y = footprint['min_y']
    max_x = footprint['max_x']
    max_y = footprint['max_y']

    start[0] = np.clip(start[0], min_x, max_x)
    start[1] = np.clip(start[1], min_y, max_y)
    end[0] = np.clip(end[0], min_x, max_x)
    end[1] = np.clip(end[1], min_y, max_y)
    return start, end

def compute_room_levels(instances_dict):
    floor_z = None
    ceiling_z = None

    if 'floor' in instances_dict and len(instances_dict['floor']) > 0:
        floor_pts = np.asarray(instances_dict['floor'][0].points, dtype=np.float32)
        if len(floor_pts) > 0:
            floor_z = float(np.percentile(floor_pts[:, 2], 50))

    if 'ceiling' in instances_dict and len(instances_dict['ceiling']) > 0:
        ceil_pts = np.asarray(instances_dict['ceiling'][0].points, dtype=np.float32)
        if len(ceil_pts) > 0:
            ceiling_z = float(np.percentile(ceil_pts[:, 2], 50))

    wall_bottoms = []
    wall_tops = []
    for wall in instances_dict.get('wall', []):
        pts = np.asarray(wall.points, dtype=np.float32)
        if len(pts) < 50:
            continue
        wall_bottoms.append(float(np.percentile(pts[:, 2], 5)))
        wall_tops.append(float(np.percentile(pts[:, 2], 95)))

    if floor_z is None and wall_bottoms:
        floor_z = float(np.median(wall_bottoms))
    if ceiling_z is None and wall_tops:
        ceiling_z = float(np.median(wall_tops))

    if floor_z is not None and wall_bottoms:
        floor_z = float(np.median([floor_z, float(np.median(wall_bottoms))]))
    if ceiling_z is not None and wall_tops:
        ceiling_z = float(np.median([ceiling_z, float(np.median(wall_tops))]))

    if floor_z is None:
        floor_z = 0.0
    if ceiling_z is None:
        ceiling_z = floor_z + 2.5
    if ceiling_z <= floor_z:
        ceiling_z = floor_z + 2.5

    return floor_z, ceiling_z

def build_wall_reference_lines(instances_dict, footprint):
    refs = []
    for wall in instances_dict.get('wall', []):
        pts = np.asarray(wall.points, dtype=np.float32)
        if len(pts) < 50:
            continue
        line = oriented_line_from_wall_points(pts[:, :2])
        start, end = clamp_wall_line_to_room(line, footprint)
        direction = np.asarray(line['direction'], dtype=np.float32)
        direction = direction / (np.linalg.norm(direction) + 1e-8)
        normal = np.array([-direction[1], direction[0]], dtype=np.float32)
        center = 0.5 * (start + end)
        refs.append({
            'start': start,
            'end': end,
            'center': center,
            'direction': direction,
            'normal': normal,
            'thickness': float(min(max(line['thickness'], 0.08), 0.35)),
        })
    return refs

def compute_oriented_room_polygon(wall_refs, footprint):
    if not wall_refs:
        if footprint is None:
            return None
        return [
            [footprint['min_x'], footprint['min_y']],
            [footprint['max_x'], footprint['min_y']],
            [footprint['max_x'], footprint['max_y']],
            [footprint['min_x'], footprint['max_y']],
        ]

    longest_ref = max(wall_refs, key=lambda ref: line_length_xy(ref['start'], ref['end']))
    primary = np.asarray(longest_ref['direction'], dtype=np.float32)
    primary = primary / (np.linalg.norm(primary) + 1e-8)
    secondary = np.array([-primary[1], primary[0]], dtype=np.float32)

    points = []
    for ref in wall_refs:
        points.append(np.asarray(ref['start'], dtype=np.float32))
        points.append(np.asarray(ref['end'], dtype=np.float32))

    pts = np.vstack(points)
    origin = np.mean(pts, axis=0)
    rel = pts - origin
    proj_primary = rel @ primary
    proj_secondary = rel @ secondary

    min_u = float(np.min(proj_primary))
    max_u = float(np.max(proj_primary))
    min_v = float(np.min(proj_secondary))
    max_v = float(np.max(proj_secondary))

    corners = [
        origin + primary * min_u + secondary * min_v,
        origin + primary * max_u + secondary * min_v,
        origin + primary * max_u + secondary * max_v,
        origin + primary * min_u + secondary * max_v,
    ]
    return [[float(c[0]), float(c[1])] for c in corners]

def get_room_axes_from_polygon(room_polygon):
    if not room_polygon or len(room_polygon) < 4:
        return None

    corners = [np.asarray(point, dtype=np.float32) for point in room_polygon[:4]]
    edge_a = corners[1] - corners[0]
    edge_b = corners[3] - corners[0]
    if np.linalg.norm(edge_b) > np.linalg.norm(edge_a):
        primary = edge_b
        secondary = edge_a
    else:
        primary = edge_a
        secondary = edge_b

    primary = primary / (np.linalg.norm(primary) + 1e-8)
    secondary = secondary / (np.linalg.norm(secondary) + 1e-8)
    origin = np.mean(np.vstack(corners), axis=0)
    rel = np.vstack(corners) - origin
    proj_primary = rel @ primary
    proj_secondary = rel @ secondary
    return {
        'origin': origin,
        'primary': primary,
        'secondary': secondary,
        'min_u': float(np.min(proj_primary)),
        'max_u': float(np.max(proj_primary)),
        'min_v': float(np.min(proj_secondary)),
        'max_v': float(np.max(proj_secondary)),
    }

def get_room_edges_from_polygon(room_polygon):
    if not room_polygon or len(room_polygon) < 4:
        return []
    corners = [np.asarray(point, dtype=np.float32) for point in room_polygon[:4]]
    edges = []
    for idx in range(4):
        start = corners[idx]
        end = corners[(idx + 1) % 4]
        direction = end - start
        length = np.linalg.norm(direction)
        if length < 1e-8:
            continue
        direction = direction / length
        center = 0.5 * (start + end)
        normal = np.array([-direction[1], direction[0]], dtype=np.float32)
        edges.append({
            'start': start,
            'end': end,
            'direction': direction,
            'normal': normal,
            'center': center,
            'length': float(length),
        })
    return edges

def snap_wall_line_to_room_edges(line, room_edges):
    if not room_edges:
        return np.asarray(line['start'], dtype=np.float32), np.asarray(line['end'], dtype=np.float32)

    start = np.asarray(line['start'], dtype=np.float32)
    end = np.asarray(line['end'], dtype=np.float32)
    center = 0.5 * (start + end)
    direction = np.asarray(line['direction'], dtype=np.float32)
    direction = direction / (np.linalg.norm(direction) + 1e-8)

    def edge_score(edge):
        alignment = abs(float(np.dot(direction, edge['direction'])))
        if alignment < 0.75:
            return float('inf')
        lateral = abs(float(np.dot(center - edge['center'], edge['normal'])))
        return lateral + (1.0 - alignment) * 0.2

    edge = min(room_edges, key=edge_score)
    if not np.isfinite(edge_score(edge)):
        return start, end

    edge_start = edge['start']
    edge_dir = edge['direction']
    edge_len = edge['length']
    start_u = float(np.dot(start - edge_start, edge_dir))
    end_u = float(np.dot(end - edge_start, edge_dir))
    u_min = max(0.0, min(start_u, end_u))
    u_max = min(edge_len, max(start_u, end_u))
    if u_max - u_min < 1e-3:
        u_center = float(np.dot(center - edge_start, edge_dir))
        half_len = max(line_length_xy(start, end) * 0.5, 0.05)
        u_min = max(0.0, u_center - half_len)
        u_max = min(edge_len, u_center + half_len)

    snapped_start = edge_start + edge_dir * u_min
    snapped_end = edge_start + edge_dir * u_max
    return snapped_start.astype(np.float32), snapped_end.astype(np.float32)

def snap_linear_instance_to_wall(start_xy, end_xy, wall_refs):
    if not wall_refs:
        return start_xy, end_xy

    center_xy = 0.5 * (start_xy + end_xy)
    width = float(np.linalg.norm(end_xy - start_xy))
    if width < 1e-6:
        width = 0.1

    def wall_dist(wall_ref):
        return abs(np.dot(center_xy - wall_ref['center'], wall_ref['normal']))

    wall_ref = min(wall_refs, key=wall_dist)
    projected_center = center_xy - wall_ref['normal'] * np.dot(center_xy - wall_ref['center'], wall_ref['normal'])
    snapped_start = projected_center - wall_ref['direction'] * (width * 0.5)
    snapped_end = projected_center + wall_ref['direction'] * (width * 0.5)
    return snapped_start, snapped_end

def extract_bim_parameters(instances_dict):
    """
    Robust parameter extraction using percentiles and shared room height.
    Fixes overwriting of OBB-derived object geometry for beam/column/door/window.
    """
    bim_data = []

    global_floor_z, global_ceiling_z = compute_room_levels(instances_dict)
    room_height = max(global_ceiling_z - global_floor_z, 0.0)
    room_footprint = compute_room_footprint(instances_dict)
    wall_refs = select_perimeter_wall_refs(instances_dict, room_footprint)
    instances_dict = filter_instances_to_wall_refs(instances_dict, wall_refs)
    room_polygon = compute_oriented_room_polygon(wall_refs, room_footprint)
    room_edges = get_room_edges_from_polygon(room_polygon)

    def safe_box_params(pcd):
        pts = np.asarray(pcd.points, dtype=np.float32)
        if len(pts) == 0:
            return None

        try:
            obb = pcd.get_oriented_bounding_box()
            center = np.asarray(obb.center, dtype=np.float32)
            extent = np.asarray(obb.extent, dtype=np.float32)
            return center, extent
        except RuntimeError as exc:
            message = str(exc)
            if "QH6154" not in message and "Qhull precision error" not in message:
                raise

            aabb = pcd.get_axis_aligned_bounding_box()
            center = np.asarray(aabb.get_center(), dtype=np.float32)
            extent = np.asarray(aabb.get_extent(), dtype=np.float32)

            # Give near-flat instances a small thickness so export stays stable.
            max_dim = float(np.max(extent)) if extent.size else 0.0
            min_supported = max(max_dim * 1e-3, 1e-3)
            extent = np.maximum(extent, min_supported)
            return center, extent

    for class_name, pcd_list in instances_dict.items():
        for idx, pcd in enumerate(pcd_list):
            pts = np.asarray(pcd.points)
            if len(pts) < 50:
                continue

            if class_name in ['beam', 'column', 'door', 'window']:
                box_params = safe_box_params(pcd)
                if box_params is None:
                    continue
                center, extent = box_params
                half_extent = extent / 2.0
                start = center - half_extent
                end = center + half_extent
                start_xy = np.asarray([start[0], start[1]], dtype=np.float32)
                end_xy = np.asarray([end[0], end[1]], dtype=np.float32)

                if class_name in ['door', 'window']:
                    start_xy, end_xy = snap_linear_instance_to_wall(start_xy, end_xy, wall_refs)

                if class_name == 'door':
                    start[2] = global_floor_z
                    end[2] = min(global_floor_z + max(extent[2], room_height * 0.35), global_ceiling_z)
                elif class_name == 'window':
                    start[2] = max(start[2], global_floor_z + room_height * 0.15)
                    end[2] = min(end[2], global_ceiling_z - room_height * 0.10)
                    if end[2] <= start[2]:
                        end[2] = min(start[2] + max(extent[2], room_height * 0.18), global_ceiling_z)
                elif class_name == 'column':
                    start[2] = global_floor_z
                    end[2] = global_ceiling_z
                elif class_name == 'beam':
                    start[2] = max(start[2], global_ceiling_z - room_height * 0.25)
                    end[2] = global_ceiling_z

                bim_obj = {
                    'id': f'{class_name}_{idx}',
                    'type': class_name,
                    'height': float(max(end[2] - start[2], 0.01)),
                    'thickness': float(min(extent[0], extent[1])),
                    'geometry': {
                        'start_x': float(start_xy[0]),
                        'start_y': float(start_xy[1]),
                        'start_z': float(start[2]),
                        'end_x': float(end_xy[0]),
                        'end_y': float(end_xy[1]),
                        'end_z': float(end[2])
                    }
                }
                bim_data.append(bim_obj)
                continue

            q_min = np.percentile(pts, 5, axis=0)
            q_max = np.percentile(pts, 95, axis=0)

            bim_obj = {
                'id': f'{class_name}_{idx}',
                'type': class_name,
                'height': float(q_max[2] - q_min[2]),
                'thickness': 0.2,
                'geometry': {
                    'start_x': float(q_min[0]),
                    'start_y': float(q_min[1]),
                    'start_z': float(q_min[2]),
                    'end_x': float(q_max[0]),
                    'end_y': float(q_max[1]),
                    'end_z': float(q_min[2]),
                }
            }

            if class_name == 'floor':
                if room_footprint is not None:
                    bim_obj['geometry']['start_x'] = room_footprint['min_x']
                    bim_obj['geometry']['start_y'] = room_footprint['min_y']
                    bim_obj['geometry']['end_x'] = room_footprint['max_x']
                    bim_obj['geometry']['end_y'] = room_footprint['max_y']
                if room_polygon is not None:
                    bim_obj['geometry']['polygon'] = room_polygon
                bim_obj['geometry']['start_z'] = global_floor_z
                bim_obj['geometry']['end_z'] = global_floor_z
            elif class_name == 'ceiling':
                if room_footprint is not None:
                    bim_obj['geometry']['start_x'] = room_footprint['min_x']
                    bim_obj['geometry']['start_y'] = room_footprint['min_y']
                    bim_obj['geometry']['end_x'] = room_footprint['max_x']
                    bim_obj['geometry']['end_y'] = room_footprint['max_y']
                if room_polygon is not None:
                    bim_obj['geometry']['polygon'] = room_polygon
                bim_obj['geometry']['start_z'] = global_ceiling_z
                bim_obj['geometry']['end_z'] = global_ceiling_z
            elif class_name == 'wall':
                xy_pts = pts[:, :2]
                line = oriented_line_from_wall_points(xy_pts)
                wall_start, wall_end = snap_wall_line_to_room_edges(line, room_edges)
                bim_obj['height'] = float(room_height)
                bim_obj['thickness'] = float(min(max(line['thickness'], 0.08), 0.35))
                bim_obj['geometry']['start_z'] = global_floor_z
                bim_obj['geometry']['end_z'] = global_floor_z
                bim_obj['geometry']['start_x'] = float(wall_start[0])
                bim_obj['geometry']['start_y'] = float(wall_start[1])
                bim_obj['geometry']['end_x'] = float(wall_end[0])
                bim_obj['geometry']['end_y'] = float(wall_end[1])

            bim_data.append(bim_obj)

    return bim_data

def main(
    input_file,
    output_dir="output_instances",
    checkpoint_paths=None,
    cube_edge=96,
    num_classes=7,
    device=None,
    visualize_instances_flag=False,
    smoothing_k=None,
    wall_ransac_thresh=None,
    floor_ceiling_ransac_thresh=None,
    align_z_up=True
):
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint_paths = checkpoint_paths 
    
    print("=" * 60)
    print("Point Cloud Instantiation Workflow (BIMNet + DBSCAN)")
    print("=" * 60)

    input_path = Path(input_file)
    pcd = load_point_cloud(input_path)
    if align_z_up:
        pcd, _ = align_point_cloud_z_up(pcd)
    pcd, _ = auto_downsample_for_device(pcd, device)
    auto_config = auto_tune_parameters(pcd)

    if smoothing_k is None:
        smoothing_k = auto_config['smoothing_k']
    if wall_ransac_thresh is None:
        wall_ransac_thresh = auto_config['wall_ransac_thresh']
    if floor_ceiling_ransac_thresh is None:
        floor_ceiling_ransac_thresh = auto_config['floor_ceiling_ransac_thresh']
    print("\nLoading BIMNet models...")
    models = build_models(checkpoint_paths, device, num_classes=num_classes)

    pcd, _, _, point_labels = run_bimnet_inference(
        pcd, models, cube_edge=cube_edge, num_classes=num_classes, device=device
    )

    print("\nStep 0.5: Smoothing predictions with KNN...")
    point_labels = smooth_labels_knn(pcd, point_labels, k=smoothing_k)
    
    print("\nStep 1: Separating point cloud by semantic class...")
    separated_classes = separate_by_label(pcd, point_labels)

    if not separated_classes:
        print("Warning: No classes found! Check your color mappings.")
        return None

    scale_factor, estimated_room_height = estimate_scene_scale_factor(separated_classes)
    print(f"Estimated room height: {estimated_room_height:.3f} m-equivalent, applying scale factor {scale_factor:.3f}")
    instantiation_pcd = scale_point_cloud(pcd, scale_factor)
    instantiation_classes = {
        class_name: scale_point_cloud(class_pcd, scale_factor)
        for class_name, class_pcd in separated_classes.items()
    }

    print("\nStep 2: Instantiating classes...")
    all_instances = {}

    if abs(scale_factor - 1.0) > 1e-8:
        dbscan_params = {
            class_name: {
                'eps': params['eps'] * scale_factor,
                'min_points': adapt_dbscan_min_points(params['min_points'], scale_factor),
            }
            for class_name, params in auto_config['dbscan_params'].items()
        }
        wall_ransac_thresh = max(wall_ransac_thresh * scale_factor, 0.012)
        floor_ceiling_ransac_thresh = max(floor_ceiling_ransac_thresh * scale_factor, 0.008)
    else:
        dbscan_params = auto_config['dbscan_params']
        wall_ransac_thresh = max(wall_ransac_thresh, 0.012)
        floor_ceiling_ransac_thresh = max(floor_ceiling_ransac_thresh, 0.008)
    wall_instances = []

    for class_name, class_pcd in instantiation_classes.items():
        if class_name in ['floor', 'ceiling']:
            instances = instantiate_dominant_plane(
                class_pcd, class_name, dist_thresh=floor_ceiling_ransac_thresh
            )
        elif class_name == 'wall':
            wall_source = o3d.geometry.PointCloud(instantiation_pcd)
            wall_source = remove_non_structural_labels_from_geometry(
                wall_source,
                instantiation_classes,
                scale_factor=scale_factor,
            )
            wall_source = remove_points_near_floor_ceiling(
                wall_source,
                all_instances.get('floor', []),
                all_instances.get('ceiling', []),
                margin=max(0.004 * scale_factor, floor_ceiling_ransac_thresh * 0.5),
                scale_factor=scale_factor,
            )
            wall_source = retain_vertical_surface_points(
                wall_source,
                radius=max(0.015 * scale_factor, wall_ransac_thresh * 0.8),
                max_nn=40,
                vertical_normal_z_max=0.45
            )
            print(f"  Wall recovery source has {len(wall_source.points)} structural candidate points")
            raw_segments = instantiate_oriented_planes(
                wall_source,
                class_name,
                dist_thresh=wall_ransac_thresh,
                min_points=100,
                max_instances=32,
                orientation='vertical',
                normal_z_max_for_vertical=0.35,
            )
            instances = merge_collinear_walls(raw_segments)
            wall_instances = instances
        elif class_name == 'column':
            params = dbscan_params.get(class_name, {'eps': 0.3, 'min_points': 100})
            cleaned_column_pcd = remove_wall_like_points_from_columns(
                class_pcd,
                wall_instances,
                scale_factor=scale_factor,
            )
            instances = instantiate_with_dbscan(cleaned_column_pcd, class_name, **params)
            instances = refine_instances_with_context(instances, class_name, all_instances, scale_factor=scale_factor)
        else:
            params = dbscan_params.get(class_name, {'eps': 0.3, 'min_points': 100})
            instances = instantiate_with_dbscan(class_pcd, class_name, **params)
            instances = refine_instances_with_context(instances, class_name, all_instances, scale_factor=scale_factor)
            
        all_instances[class_name] = instances

    output_instances = scale_instances_dict(all_instances, 1.0 / scale_factor) if abs(scale_factor - 1.0) > 1e-8 else all_instances

    print("\nStep 3: Extracting BIM Parameters and Saving...")
    save_instances(output_instances, output_dir)
    
    bim_json_data = extract_bim_parameters(output_instances)
    with open(Path(output_dir) / "bim_reconstruction_data.json", "w") as f:
        json.dump(bim_json_data, f, indent=4)
    print(f"BIM parameters saved to {output_dir}/bim_reconstruction_data.json")

    if visualize_instances_flag:
        visualize_summary(output_instances, separated_classes, pcd)

    return output_instances, separated_classes, pcd

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="BIMNet semantic segmentation + DBSCAN instance extraction"
    )
    parser.add_argument("--input_file", help="Path to input point cloud (.ply/.pcd, max 2 GB)")
    parser.add_argument("--output_dir", default="output_instances", help="Directory to save instance PLYs")
    parser.add_argument("--checkpoint", action="append", default=[], help="Path(s) to BIMNet checkpoint(s)")
    parser.add_argument("--cube_edge", type=int, default=96, help="Voxel grid edge length")
    parser.add_argument("--num_classes", type=int, default=7, help="Number of BIMNet output classes")
    parser.add_argument("--cpu", action="store_true", help="Force CPU")
    parser.add_argument("--vis-instances", action="store_true", help="Visualize DBSCAN instances")
    parser.add_argument("--smooth-k", type=int, default=None, help="K for KNN smoothing; auto-estimated if omitted")
    parser.add_argument("--wall-ransac-thresh", type=float, default=None, help="RANSAC distance threshold for wall extraction; auto-estimated if omitted")
    parser.add_argument("--floor-ceiling-ransac-thresh", type=float, default=None, help="RANSAC distance threshold for floor and ceiling extraction; auto-estimated if omitted")
    parser.add_argument("--no-align-z-up", action="store_true", help="Skip rotating the dominant plane normal onto +Z before inference")
    
    args = parser.parse_args()
    device = "cpu" if args.cpu else ("cuda" if torch.cuda.is_available() else "cpu")

    main(
        input_file=args.input_file,
        output_dir=args.output_dir,
        checkpoint_paths=args.checkpoint,
        cube_edge=args.cube_edge,
        num_classes=args.num_classes,
        device=device,
        visualize_instances_flag=args.vis_instances,
        smoothing_k=args.smooth_k,
        wall_ransac_thresh=args.wall_ransac_thresh,
        floor_ceiling_ransac_thresh=args.floor_ceiling_ransac_thresh,
        align_z_up=not args.no_align_z_up
    )
