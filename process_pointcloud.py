#!/usr/bin/env python
"""
Lightweight wrapper - semantic segmentation only, skip DBSCAN
Copy from viz_inst.py's inference logic but save immediately
"""
import sys
import argparse
import numpy as np
from pathlib import Path
import torch
import open3d as o3d
from plyfile import PlyData, PlyElement

# Add scan2bim to path
sys.path.insert(0, r'C:\Users\iamsa\Downloads\scan2bim')

from model.bimnet import BIMNet


def load_point_cloud(file_path):
    """Load PLY point cloud using Open3D"""
    return o3d.io.read_point_cloud(str(file_path))


def voxelize_points(points, cube_edge):
    """Voxelize points into grid, matching viz_inst.py logic"""
    # Normalize to [0, 1]
    min_bounds = points.min(0)
    max_bounds = points.max(0)
    points_norm = (points - min_bounds) / (max_bounds - min_bounds + 1e-8)

    # Scale to grid
    points_grid = (points_norm * (cube_edge - 1)).astype(np.int32)
    points_grid = np.clip(points_grid, 0, cube_edge - 1)

    # Create occupancy grid
    vox = np.zeros((1, cube_edge, cube_edge, cube_edge), dtype=np.float32)
    vox[0, points_grid[:, 0], points_grid[:, 1], points_grid[:, 2]] = 1.0

    return vox, points_grid


def color_label(labels, num_classes=8):
    """Map integer labels to RGB colors using colormap"""
    import matplotlib.pyplot as plt
    try:
        cmap = plt.colormaps['tab20']
    except (AttributeError, KeyError):
        cmap = plt.cm.get_cmap('tab20')

    flat = labels.flatten()
    colors = cmap(flat % num_classes)[:, :3]
    return colors.reshape((*labels.shape, 3))


def print_color_legend(class_names, num_classes=8):
    """Print class-to-color legend for the active colormap"""
    import matplotlib.pyplot as plt
    try:
        cmap = plt.colormaps['tab20']
    except (AttributeError, KeyError):
        cmap = plt.cm.get_cmap('tab20')
    print("\nLegend (tab20):")
    for idx in range(num_classes):
        name = class_names[idx] if idx < len(class_names) else f"class_{idx}"
        r, g, b, _ = cmap(idx)
        print(f"  {idx}: {name} -> RGB({r:.3f}, {g:.3f}, {b:.3f})")


def run_bimnet_inference(pcd, model, cube_edge=128, num_classes=8, device="cuda"):
    """Run BIMNet on point cloud and assign semantic colors"""
    points = np.asarray(pcd.points)
    print(f"[OK] Loaded {points.shape[0]} points")

    # Voxelize
    vox, points_grid = voxelize_points(points, cube_edge)

    # To tensor [B, C, D, H, W]
    x = torch.from_numpy(vox).unsqueeze(0).to(device)

    # BIMNet inference
    with torch.no_grad():
        logits = model(x)
        preds = logits.argmax(dim=1).squeeze(0).cpu().numpy()

    # Colorize using predictions
    colors_volume = color_label(preds, num_classes=num_classes)
    point_colors = colors_volume[
        points_grid[:, 0],
        points_grid[:, 1],
        points_grid[:, 2],
    ]
    point_labels = preds[
        points_grid[:, 0],
        points_grid[:, 1],
        points_grid[:, 2]
    ]

    pcd.colors = o3d.utility.Vector3dVector(point_colors)
    return pcd, point_labels


def separate_by_label(pcd, point_labels, num_classes=8):
    """Separate point cloud by semantic class and count points"""
    points = np.asarray(pcd.points)
    colors = np.asarray(pcd.colors) if pcd.has_colors() else np.ones((len(points), 3)) * 0.5

    class_names = ["ceiling", "floor", "wall", "beam", "column", "window", "door", "unknown"]

    print("\nStep 1: Separating point cloud by semantic class...")
    for class_id in sorted(np.unique(point_labels)):
        mask = point_labels == class_id
        count = np.sum(mask)
        class_name = class_names[class_id] if class_id < len(class_names) else f"class_{class_id}"
        print(f"  {class_name}: {count} points")

    return pcd, point_labels


def save_colored_ply(pcd, output_path):
    """Save PLY with colors"""
    o3d.io.write_point_cloud(str(output_path), pcd)
    print(f"[OK] Saved colored point cloud to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='BIMNet semantic segmentation only')
    parser.add_argument('--input_file', required=True, help='Input PLY file path')
    parser.add_argument('--output_dir', required=True, help='Output directory')
    parser.add_argument('--checkpoint', required=True, help='Model checkpoint path')
    parser.add_argument('--cpu', action='store_true', help='Use CPU instead of GPU')

    args = parser.parse_args()

    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: Input file not found: {args.input_file}")
        sys.exit(1)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{input_path.stem}_classified.ply"

    print("=" * 60)
    print("BIMNet Semantic Segmentation (No Instance Clustering)")
    print("=" * 60)

    try:
        device = torch.device('cpu' if args.cpu else 'cuda' if torch.cuda.is_available() else 'cpu')

        class_names = ["ceiling", "floor", "wall", "beam", "column", "window", "door", "unknown"]
        print_color_legend(class_names, num_classes=8)

        print(f"\n[1] Loading point cloud from: {input_path}")
        pcd = load_point_cloud(input_path)

        print(f"[2] Loading BIMNet model from: {args.checkpoint}")
        model = BIMNet(num_classes=8)
        checkpoint = torch.load(args.checkpoint, map_location=device)
        if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint:
            model.load_state_dict(checkpoint['model_state_dict'])
        else:
            model.load_state_dict(checkpoint)
        model.eval()
        model.to(device)
        print("[OK] Model loaded")

        print("\n[3] Running BIMNet semantic segmentation...")
        pcd, point_labels = run_bimnet_inference(pcd, model, cube_edge=128, num_classes=8, device=device)

        # Show class distribution
        separate_by_label(pcd, point_labels, num_classes=8)

        print("\n[4] Saving classified point cloud...")
        save_colored_ply(pcd, output_path)

        print("\n" + "=" * 60)
        print("[OK] Processing complete")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
