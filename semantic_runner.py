#!/usr/bin/env python
"""
Semantic-only BIMNet processing (no instantiation).
Writes a colored PLY to the output directory.
"""
import sys
import argparse
from pathlib import Path

import numpy as np
import open3d as o3d
import matplotlib.pyplot as plt
import torch

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
        return o3d.io.read_point_cloud(str(file_path))
    raise ValueError(f"Unsupported file format: {file_path.suffix}")


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


def run_bimnet_inference(pcd, model, cube_edge=96, num_classes=8, device="cuda"):
    points = np.asarray(pcd.points)
    vox, points_grid = voxelize_points(points, cube_edge)
    x = torch.from_numpy(vox).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(x)
        preds = logits.argmax(dim=1).squeeze(0).cpu().numpy()

    colors_volume = color_label(preds, num_classes=num_classes)
    point_colors = colors_volume[points_grid[:, 0], points_grid[:, 1], points_grid[:, 2]]
    pcd.colors = o3d.utility.Vector3dVector(point_colors)
    return pcd


def maybe_downsample(pcd, voxel_size):
    if voxel_size <= 0:
        return pcd
    return pcd.voxel_down_sample(voxel_size=voxel_size)


def main(args):
    device = "cpu" if args.cpu else ("cuda" if torch.cuda.is_available() else "cpu")
    input_path = Path(args.input_file)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    pcd = load_point_cloud(input_path)
    model = finetune_model(args.checkpoint, device, num_new_classes=args.num_classes)

    pcd = run_bimnet_inference(
        pcd,
        model,
        cube_edge=args.cube_edge,
        num_classes=args.num_classes,
        device=device,
    )

    pcd = maybe_downsample(pcd, args.voxel_size)

    output_path = output_dir / f"{input_path.stem}_semantic.ply"
    o3d.io.write_point_cloud(str(output_path), pcd)
    print(f"Semantic point cloud saved to {output_path}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BIMNet semantic-only processing")
    parser.add_argument("--input_file", required=True, help="Path to input point cloud (.ply/.pcd)")
    parser.add_argument("--output_dir", required=True, help="Directory to save output PLY")
    parser.add_argument("--checkpoint", required=True, help="Path to BIMNet checkpoint")
    parser.add_argument("--cube_edge", type=int, default=96, help="Voxel grid edge length")
    parser.add_argument("--num_classes", type=int, default=8, help="Number of BIMNet output classes")
    parser.add_argument("--voxel_size", type=float, default=0.02, help="Downsample voxel size (0 to disable)")
    parser.add_argument("--cpu", action="store_true", help="Force CPU")

    args = parser.parse_args()
    sys.exit(main(args))
