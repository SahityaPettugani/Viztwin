import numpy as np
import torch
from torch.utils.data import Dataset
from os import path
from plyfile import PlyData

LABEL_REMAP = np.array(
    [0, 1, 2, 3, 4, 5, 6, -100, -100, -100, -100, -100, -100, -100],
    dtype=np.int32,
)

class S3DISDataset(Dataset):
    def __init__(self,
                 root_path="../Scan-to-BIM",
                 splits_path="../Scan-to-BIM",
                 split="train",
                 cube_edge=96,
                 augment=True,
                 dilate_labels=True):

        self.root_path = root_path
        self.cube_edge = cube_edge
        self.augment = augment
        self.dilate_labels = dilate_labels

        self.cmap = self.init_cmap()
        self.idmap = self.init_idmap()
        self.weights = self.init_weights()      
        self.cnames = list(self.idmap.keys())

        split_path = path.join(splits_path, split + ".txt")
        with open(split_path, "r", encoding="utf-8") as split_file:
            self.items = [line.strip() for line in split_file]

    def init_cmap(self):
        cmap = np.array(  [[128, 64,128], # ceiling
                           [244, 35,232], # floor
                           [ 70, 70, 70], # wall
                           [102,102,156], # beam
                           [190,153,153], # column
                           [153,153,153], # window
                           [250,170, 30]], # door
                        dtype=np.uint8)
        return cmap

    def init_idmap(self):
        idmap = {0: 'ceiling',
                 1: 'floor',
                 2: 'wall',
                 3: 'beam',
                 4: 'column',
                 5: 'window',
                 6: 'door', 
        }
        idmap = {v:k for k,v in idmap.items()}
        return idmap
        
    def init_weights(self):
        pts = np.array([46378544, 74583849, 216401489, 2886463, 5405718, 12127051, 5926637], dtype=np.int32)
        weights = 1/(pts + 1e-6)
        median_weight = np.median(weights)
        weights = np.clip(weights, a_min=None, a_max=median_weight * 10.0) 
        weights[0] *= 5.0
        weights[1] *= 2.0
        weights[2] *= 2.0
        weights[3] *= 5.0
        weights[4] *= 5.0
        weights[5] *= 2.0
        weights[6] *= 2.0
        weights = weights / weights.mean()

        return weights.astype(np.float32)
    
    def __len__(self):
        return len(self.items)

    def color_label(self, lab, norm=True):
        if norm:
            return self.cmap[lab.numpy()]/255.
        else:
            return self.cmap[lab.numpy()]
        
    def remap_labels(self, labels):
        labels = np.asarray(labels, dtype=np.int32)
        remapped = np.full(labels.shape, -100, dtype=np.int32)
        valid_mask = (labels >= 0) & (labels < len(LABEL_REMAP))
        remapped[valid_mask] = LABEL_REMAP[labels[valid_mask]]
        return remapped

    def __getitem__(self, item):
        fname = path.join(self.root_path, self.items[item])
        
        # 1. LOAD DATA
        data = PlyData.read(fname)
        
        # Load XYZ and force FLOAT immediately
        xyz = np.array([data['vertex']['x'], data['vertex']['y'], data['vertex']['z']]).T
        xyz = xyz.astype(np.float32) 

        # Load Labels
        if 'label' in data['vertex']:
            raw_lab = data['vertex']['label']
        elif 'scalar_label' in data['vertex']:
            raw_lab = data['vertex']['scalar_label']
        elif 'scalar_Classification' in data['vertex']:
            raw_lab = data['vertex']['scalar_Classification']
        else:
            available_keys = str(data['vertex'].data.dtype.names)
            raise KeyError(f"Label field not found in {fname}. Available keys: {available_keys}")

        # Process Labels
        lab = np.round(raw_lab).astype(np.int32)
        lab = np.squeeze(np.array(lab))
        lab = self.remap_labels(lab)  
        lab[lab > 6] = -100 # Safety mask for clutter

        # 2. PHYSICAL SCALING (WHOLE ROOM)
        
        # A. Center X and Y
        xyz[:, 0] -= xyz[:, 0].mean()
        xyz[:, 1] -= xyz[:, 1].mean()
        
        # B. Anchor Z (Floor) to 0
        xyz[:, 2] -= xyz[:, 2].min()
        
        # C. Scale by Largest Dimension
        # Map largest dimension to approx 1.6 (leaving ~20% padding in 2.0 box)
        ranges = xyz.max(axis=0) - xyz.min(axis=0)
        max_dim = ranges.max() + 1e-6 
        
        scale_factor = 1.6 / max_dim
        xyz *= scale_factor 
        
        # D. Shift Z to start at -0.8 (Bottom of grid with padding)
        xyz[:, 2] -= 0.8
        
        # 3. AUGMENTATION (Must happen BEFORE converting to Int)
        if self.augment:
            # Random Rotation: Z-axis only
            if np.random.random() < 0.5:
                angle = np.random.random() * 2 * np.pi
                c, s = np.cos(angle), np.sin(angle)
                R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
                xyz = np.dot(xyz, R.T)

            # Random Shift
            if np.random.random() < 0.5:
                xyz += (np.random.random((3,)) * 0.1 - 0.05)

            # Random Rescale
            if np.random.random() < 0.5:
                scale = 0.9 + 0.2 * np.random.random() # 0.9x to 1.1x
                xyz *= scale

            # Random Jitter
            if np.random.random() < 0.5:
                noise = np.random.normal(0, 0.01, xyz.shape) 
                xyz += noise

        # 4. VOXELIZATION (The Final Step)
        # Shift [-1, 1] -> [0, 2]
        xyz = xyz + 1.0 
        
        # Scale to Grid Size [0, 96]
        # CRITICAL: Convert to Int32 ONLY HERE at the very end.
        xyz = np.round(xyz * (self.cube_edge // 2)).astype(np.int32)
        
        # 5. VALIDITY CHECK
        valid = np.logical_and(np.all(xyz >= 0, axis=1), np.all(xyz < self.cube_edge, axis=1))
        xyz = xyz[valid,:]
        lab = lab[valid]

        # 6. FILL GRID
        # Initialize Geometry
        geom = np.zeros((self.cube_edge, self.cube_edge, self.cube_edge), dtype=np.float32)
        
        # CRITICAL FIX: Initialize Labels to -1 (Ignore Index)
        # This prevents the model from learning "Empty Air = Ceiling (0)"
        labs = np.full((self.cube_edge, self.cube_edge, self.cube_edge), -100, dtype=np.int64)

        if len(xyz) > 0:
            # Fill existing points
            geom[tuple(xyz.T)] = 1
            labs[tuple(xyz.T)] = lab
        
            if self.dilate_labels:
                target_classes = [1, 2, 3, 4, 5, 6] 
                valid_indices = np.where(np.isin(labs, target_classes))
                
                if len(valid_indices[0]) > 0:
                    vx, vy, vz = valid_indices
                    offsets = [
                        (1, 0, 0), (-1, 0, 0),
                        (0, 1, 0), (0, -1, 0),
                        (0, 0, 1), (0, 0, -1)
                    ]
                    
                    for dx, dy, dz in offsets:
                        nx = np.clip(vx + dx, 0, self.cube_edge-1)
                        ny = np.clip(vy + dy, 0, self.cube_edge-1)
                        nz = np.clip(vz + dz, 0, self.cube_edge-1)
                        mask_empty = (geom[nx, ny, nz] == 0)
                        
                        if np.any(mask_empty):
                            fill_x = nx[mask_empty]
                            fill_y = ny[mask_empty]
                            fill_z = nz[mask_empty]
                            source_labels = labs[vx, vy, vz]
                            
                            geom[fill_x, fill_y, fill_z] = 1.0
                            labs[fill_x, fill_y, fill_z] = source_labels[mask_empty]

        return torch.from_numpy(geom).unsqueeze(0), torch.from_numpy(labs)
