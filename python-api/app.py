"""
VizTwin Python Processing API
FastAPI service for point cloud semantic segmentation using BIMNet
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import uvicorn
import numpy as np
import open3d as o3d
import torch
from pathlib import Path
import tempfile
import shutil
import json
from typing import List, Dict, Any
import traceback

from model.bimnet import BIMNet
from sklearn.cluster import DBSCAN
import matplotlib.pyplot as plt

app = FastAPI(title="VizTwin Processing API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model storage
MODELS = None
DEVICE = None
CUBE_EDGE = 128
NUM_CLASSES = 8

# Semantic label mapping
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

def load_models(checkpoint_paths: List[str], device: str, num_classes: int = 8):
    """Load BIMNet models from checkpoints"""
    models = []
    for ckpt in checkpoint_paths:
        print(f"Loading checkpoint: {ckpt}")
        model = BIMNet(num_classes=num_classes)
        state = torch.load(ckpt, map_location=device)
        model.load_state_dict(state)
        model.to(device)
        model.eval()
        models.append(model)
    return models

def voxelize_points(points: np.ndarray, cube_edge: int):
    """Normalize points into [0, cube_edge) and create voxel occupancy grid"""
    # Normalize to [0, 1]
    min_bounds = points.min(0)
    max_bounds = points.max(0)
    points_norm = (points - min_bounds) / (max_bounds - min_bounds + 1e-8)

    # Scale to grid
    points_grid = (points_norm * (cube_edge - 1)).astype(np.int32)
    points_grid = np.clip(points_grid, 0, cube_edge - 1)

    # Occupancy grid
    vox = np.zeros((1, cube_edge, cube_edge, cube_edge), dtype=np.float32)
    vox[0, points_grid[:, 0], points_grid[:, 1], points_grid[:, 2]] = 1.0

    return vox, points_grid

def color_label(labels: np.ndarray, num_classes: int = 8):
    """Map integer labels to RGB colors using matplotlib colormap"""
    cmap = plt.get_cmap("tab20", num_classes)
    flat = labels.flatten()
    colors = cmap(flat % num_classes)[:, :3]  # RGB only
    return colors.reshape((*labels.shape, 3))

def run_bimnet_inference(pcd: o3d.geometry.PointCloud, models: List, 
                         cube_edge: int = 128, num_classes: int = 8, 
                         device: str = "cuda"):
    """Run BIMNet inference on point cloud"""
    points = np.asarray(pcd.points)
    print(f"Processing {points.shape[0]} points")

    # Voxelize
    vox, points_grid = voxelize_points(points, cube_edge)

    # To tensor [B, C, D, H, W]
    x = torch.from_numpy(vox).unsqueeze(0).to(device)

    # Ensemble inference
    with torch.no_grad():
        logits_sum = None
        for model in models:
            logits = model(x)  # [B, num_classes, D, H, W]
            logits_sum = logits if logits_sum is None else logits_sum + logits

        logits_avg = logits_sum / len(models)
        preds = logits_avg.argmax(dim=1).squeeze(0).cpu().numpy()  # [D, H, W]

    # Colorize
    colors_volume = color_label(preds, num_classes=num_classes)  # [D, H, W, 3]
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
    return pcd, preds, points_grid, point_labels

def separate_by_label(pcd: o3d.geometry.PointCloud, point_labels: np.ndarray):
    """Split point cloud into semantic classes using integer labels"""
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

def instantiate_with_dbscan(pcd: o3d.geometry.PointCloud, class_name: str, 
                            eps: float = 0.1, min_points: int = 100):
    """Use DBSCAN clustering to identify individual instances within a class"""
    if len(pcd.points) == 0:
        return []
    
    points = np.asarray(pcd.points)
    colors = np.asarray(pcd.colors)
    
    print(f"Clustering {class_name} with DBSCAN (eps={eps}, min_points={min_points})...")
    
    # Perform DBSCAN clustering
    clustering = DBSCAN(eps=eps, min_samples=min_points).fit(points)
    labels = clustering.labels_
    
    # Count instances (excluding noise points labeled as -1)
    unique_labels = set(labels)
    n_clusters = len(unique_labels) - (1 if -1 in labels else 0)
    n_noise = list(labels).count(-1)
    
    print(f"  Found {n_clusters} instances ({n_noise} noise points)")
    
    # Create separate point cloud for each instance
    instances = []
    for label_id in unique_labels:
        if label_id == -1:  # Skip noise points
            continue
        
        instance_mask = labels == label_id
        instance_points = points[instance_mask]
        instance_colors = colors[instance_mask]
        
        instance_pcd = o3d.geometry.PointCloud()
        instance_pcd.points = o3d.utility.Vector3dVector(instance_points)
        instance_pcd.colors = o3d.utility.Vector3dVector(instance_colors)
        
        instances.append(instance_pcd)
    
    return instances

@app.on_event("startup")
async def startup_event():
    """Initialize models on startup"""
    global MODELS, DEVICE
    
    # Check for GPU
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {DEVICE}")
    
    # Load checkpoint
    checkpoint_path = Path("checkpoints/val_best.pth")
    if not checkpoint_path.exists():
        print(f"WARNING: Checkpoint not found at {checkpoint_path}")
        print("Place your val_best.pth file in the checkpoints/ directory")
        MODELS = None
    else:
        try:
            MODELS = load_models([str(checkpoint_path)], DEVICE, NUM_CLASSES)
            print("Models loaded successfully!")
        except Exception as e:
            print(f"Error loading models: {e}")
            MODELS = None

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "VizTwin Processing API",
        "device": DEVICE,
        "models_loaded": MODELS is not None,
        "cuda_available": torch.cuda.is_available()
    }

@app.post("/process")
async def process_point_cloud(file: UploadFile = File(...)):
    """
    Process uploaded point cloud file with BIMNet semantic segmentation
    
    Returns:
        - processed_ply: Full processed point cloud with semantic colors
        - instances: Separate instance files per class
        - summary: Statistics about detected classes and instances
    """
    if MODELS is None:
        raise HTTPException(
            status_code=503,
            detail="Models not loaded. Please place val_best.pth in checkpoints/ directory"
        )
    
    # Validate file extension
    if not file.filename.endswith('.ply'):
        raise HTTPException(status_code=400, detail="Only .ply files are supported")
    
    # Create temporary directory for processing
    temp_dir = Path(tempfile.mkdtemp())
    
    try:
        # Save uploaded file
        input_path = temp_dir / "input.ply"
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        print(f"\n{'='*60}")
        print(f"Processing: {file.filename}")
        print(f"{'='*60}")
        
        # Load point cloud
        pcd = o3d.io.read_point_cloud(str(input_path))
        print(f"Loaded {len(pcd.points)} points")
        
        # Run BIMNet inference
        print("\nRunning BIMNet semantic segmentation...")
        pcd, preds_volume, points_grid, point_labels = run_bimnet_inference(
            pcd, MODELS, CUBE_EDGE, NUM_CLASSES, DEVICE
        )
        
        # Save processed point cloud with semantic colors
        processed_path = temp_dir / "processed.ply"
        o3d.io.write_point_cloud(str(processed_path), pcd)
        
        # Separate by semantic class
        print("\nSeparating by semantic class...")
        separated_classes = separate_by_label(pcd, point_labels)
        
        # DBSCAN parameters per class
        dbscan_params = {
            'ceiling':   {'eps': 0.2, 'min_points': 200},
            'floor':     {'eps': 0.2, 'min_points': 200},
            'wall':      {'eps': 0.2, 'min_points': 300},
            'beam':      {'eps': 0.1, 'min_points': 150},
            'column':    {'eps': 0.1, 'min_points': 50},
            'window':    {'eps': 0.1, 'min_points': 50},
            'door':      {'eps': 0.15, 'min_points': 100},
            'unassigned': {'eps': 0.1, 'min_points': 200},
        }
        
        # Instance segmentation with DBSCAN
        print("\nPerforming instance segmentation...")
        all_instances = {}
        instances_dir = temp_dir / "instances"
        instances_dir.mkdir()
        
        for class_name, class_pcd in separated_classes.items():
            params = dbscan_params.get(class_name, {'eps': 0.2, 'min_points': 100})
            instances = instantiate_with_dbscan(
                class_pcd,
                class_name,
                eps=params['eps'],
                min_points=params['min_points']
            )
            all_instances[class_name] = instances
            
            # Save each instance
            class_dir = instances_dir / class_name
            class_dir.mkdir()
            for i, instance in enumerate(instances):
                instance_path = class_dir / f"{class_name}_instance_{i:03d}.ply"
                o3d.io.write_point_cloud(str(instance_path), instance)
        
        # Create combined instances file
        combined_pcd = o3d.geometry.PointCloud()
        for class_name, instances in all_instances.items():
            for instance in instances:
                combined_pcd += instance
        
        combined_path = temp_dir / "all_instances_combined.ply"
        o3d.io.write_point_cloud(str(combined_path), combined_pcd)
        
        # Generate summary
        summary = {
            "total_points": len(pcd.points),
            "classes": {},
            "total_instances": 0
        }
        
        for class_name, instances in all_instances.items():
            summary["classes"][class_name] = {
                "instance_count": len(instances),
                "point_count": sum(len(inst.points) for inst in instances)
            }
            summary["total_instances"] += len(instances)
        
        # Save summary
        summary_path = temp_dir / "summary.json"
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)
        
        print(f"\n{'='*60}")
        print("Processing complete!")
        print(f"Total instances: {summary['total_instances']}")
        print(f"{'='*60}\n")
        
        # Create zip file with all results
        import zipfile
        output_zip = temp_dir / "results.zip"
        with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add main files
            zipf.write(processed_path, "processed.ply")
            zipf.write(combined_path, "all_instances_combined.ply")
            zipf.write(summary_path, "summary.json")
            
            # Add all instance files
            for class_dir in instances_dir.iterdir():
                if class_dir.is_dir():
                    for instance_file in class_dir.iterdir():
                        arcname = f"instances/{class_dir.name}/{instance_file.name}"
                        zipf.write(instance_file, arcname)
        
        # Return the zip file
        return FileResponse(
            path=str(output_zip),
            media_type="application/zip",
            filename=f"processed_{file.filename.replace('.ply', '.zip')}",
            background=None  # Don't delete temp dir yet
        )
        
    except Exception as e:
        print(f"Error processing point cloud: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    
    finally:
        # Cleanup will happen after response is sent
        pass

@app.post("/process-simple")
async def process_simple(file: UploadFile = File(...)):
    """
    Simplified endpoint that returns only the processed point cloud with semantic colors
    (for faster response times)
    """
    if MODELS is None:
        raise HTTPException(
            status_code=503,
            detail="Models not loaded. Please place val_best.pth in checkpoints/ directory"
        )
    
    if not file.filename.endswith('.ply'):
        raise HTTPException(status_code=400, detail="Only .ply files are supported")
    
    temp_dir = Path(tempfile.mkdtemp())
    
    try:
        # Save uploaded file
        input_path = temp_dir / "input.ply"
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Load and process
        pcd = o3d.io.read_point_cloud(str(input_path))
        pcd, preds_volume, points_grid, point_labels = run_bimnet_inference(
            pcd, MODELS, CUBE_EDGE, NUM_CLASSES, DEVICE
        )
        
        # Save processed point cloud
        output_path = temp_dir / "processed.ply"
        o3d.io.write_point_cloud(str(output_path), pcd)
        
        # Generate simple summary
        unique, counts = np.unique(point_labels, return_counts=True)
        summary = {
            "total_points": len(pcd.points),
            "label_distribution": {
                ID_TO_NAME[int(label)]: int(count) 
                for label, count in zip(unique, counts)
            }
        }
        
        return FileResponse(
            path=str(output_path),
            media_type="application/octet-stream",
            filename=f"processed_{file.filename}",
            headers={"X-Processing-Summary": json.dumps(summary)}
        )
        
    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
