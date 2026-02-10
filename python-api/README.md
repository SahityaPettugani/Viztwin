# VizTwin Python Processing API

This is the Python backend service that handles point cloud processing with BIMNet semantic segmentation.

## Setup Instructions

### 1. Install Dependencies

```bash
cd python-api
pip install -r requirements.txt
```

### 2. Add Your Model Files

Create the required directory structure:

```bash
mkdir -p model
mkdir -p checkpoints
```

Copy your files:
- Place `bimnet.py` in the `model/` directory
- Place `val_best.pth` checkpoint in the `checkpoints/` directory

Your structure should look like:
```
python-api/
├── app.py
├── requirements.txt
├── model/
│   └── bimnet.py          # Your BIMNet model definition
└── checkpoints/
    └── val_best.pth       # Your trained model weights
```

### 3. Run the API

```bash
python app.py
```

The API will start on `http://localhost:8000`

## API Endpoints

### `GET /`
Health check endpoint. Returns status and configuration.

**Response:**
```json
{
  "status": "online",
  "service": "VizTwin Processing API",
  "device": "cuda",
  "models_loaded": true,
  "cuda_available": true
}
```

### `POST /process`
Full processing pipeline with instance segmentation.

**Request:**
- File upload (multipart/form-data)
- Field name: `file`
- Accepted formats: `.ply`

**Response:**
- ZIP file containing:
  - `processed.ply` - Point cloud with semantic colors
  - `all_instances_combined.ply` - All instances combined
  - `summary.json` - Processing statistics
  - `instances/` - Individual instance files per class

### `POST /process-simple`
Simplified processing (semantic segmentation only, faster).

**Request:**
- File upload (multipart/form-data)
- Field name: `file`
- Accepted formats: `.ply`

**Response:**
- Single `.ply` file with semantic colors
- Summary in `X-Processing-Summary` header

## Testing

You can test the API with curl:

```bash
# Health check
curl http://localhost:8000/

# Process a point cloud (simple mode)
curl -X POST -F "file=@your_pointcloud.ply" \
  http://localhost:8000/process-simple \
  --output processed.ply

# Process a point cloud (full mode with instances)
curl -X POST -F "file=@your_pointcloud.ply" \
  http://localhost:8000/process \
  --output results.zip
```

## Configuration

Edit `app.py` to modify:
- `CUBE_EDGE` - Voxel grid resolution (default: 128)
- `NUM_CLASSES` - Number of semantic classes (default: 8)
- DBSCAN parameters per class in the `dbscan_params` dictionary

## Troubleshooting

### Models not loading
- Ensure `val_best.pth` is in `checkpoints/` directory
- Check that `model/bimnet.py` exists and is correctly implemented
- Verify PyTorch version compatibility

### CUDA errors
- If GPU is not available, the API will automatically use CPU
- For CPU-only: Install PyTorch CPU version
  ```bash
  pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
  ```

### Memory errors
- Reduce `CUBE_EDGE` to 64 or 96 for lower memory usage
- Process smaller point clouds
- Increase system RAM or use a machine with more GPU memory

## Production Deployment

For production deployment:

1. **Use a proper ASGI server:**
   ```bash
   uvicorn app:app --host 0.0.0.0 --port 8000 --workers 1
   ```

2. **Deploy on a GPU server:**
   - AWS EC2 with GPU (p2, p3, or g4 instances)
   - Google Cloud Compute with GPU
   - Your own server with NVIDIA GPU

3. **Set environment variable for Python API URL in your Deno server**

4. **Consider using Docker** (see Dockerfile below)

### Docker Deployment (Optional)

Create `Dockerfile`:
```dockerfile
FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t viztwin-api .
docker run -p 8000:8000 --gpus all viztwin-api
```
