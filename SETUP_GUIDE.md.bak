# VizTwin Point Cloud Processing - Complete Setup Guide

This guide will help you set up the complete VizTwin system with Python BIMNet processing integration.

## Architecture Overview

```
Frontend (React) → Deno Server → Python API (BIMNet) → Processed Point Clouds
                          ↓
                   Supabase Storage
```

## Prerequisites

- Node.js and npm installed
- Python 3.8+ installed
- (Optional) NVIDIA GPU with CUDA for faster processing
- Your BIMNet model files (`bimnet.py` and `val_best.pth`)

---

## Part 1: Python API Setup

### Step 1: Navigate to Python API Directory

```bash
cd python-api
```

### Step 2: Install Python Dependencies

```bash
pip install -r requirements.txt
```

**Note:** If you don't have a GPU or want CPU-only installation:
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

### Step 3: Set Up Model Files

Create the required directory structure:

```bash
mkdir -p model
mkdir -p checkpoints
```

**Copy your BIMNet model files:**

1. **Place `bimnet.py`** in the `model/` directory
   - This file should contain your `BIMNet` class definition
   - Path should be: `python-api/model/bimnet.py`

2. **Place `val_best.pth`** in the `checkpoints/` directory
   - This is your trained model checkpoint
   - Path should be: `python-api/checkpoints/val_best.pth`

Your directory structure should look like:
```
python-api/
├── app.py
├── requirements.txt
├── model/
│   └── bimnet.py          ← Your model definition
└── checkpoints/
    └── val_best.pth       ← Your trained weights
```

### Step 4: Start the Python API

```bash
python app.py
```

The API will start on `http://localhost:8000`

**Verify it's running:**
```bash
curl http://localhost:8000/
```

You should see:
```json
{
  "status": "online",
  "service": "VizTwin Processing API",
  "device": "cuda",  // or "cpu"
  "models_loaded": true,
  "cuda_available": true  // or false
}
```

---

## Part 2: Frontend & Deno Server Setup

### Step 1: Set Environment Variable

The Deno server needs to know where your Python API is running.

**For Development (localhost):**
The default is already set to `http://localhost:8000`, so no action needed.

**For Production (deployed Python API):**
In your Supabase dashboard, add an environment variable:
- Name: `PYTHON_API_URL`
- Value: `https://your-python-api-domain.com`

### Step 2: Verify Database Setup

Make sure you've created the Supabase database table by running this SQL in your Supabase dashboard:

```sql
CREATE TABLE kv_store_1d0df597 (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Step 3: Run the Application

Your VizTwin application should now be ready! The system will:

1. ✅ Upload point cloud files to Supabase Storage
2. ✅ Send them to Python API for BIMNet processing
3. ✅ Store processed results back in Supabase
4. ✅ Display processed point clouds with semantic colors

---

## Usage Flow

### Uploading a Point Cloud

1. Click **UPLOAD** button
2. Select a `.ply` file
3. Fill in project properties
4. Click **UPLOAD** to start processing

### Processing Stages

You'll see three stages:
- **UPLOADING...** - File is being uploaded to storage
- **PROCESSING...** - BIMNet is classifying the point cloud
- **FINALIZING...** - Saving results to database

### Viewing Results

- Processed point clouds are displayed in the Library page
- Click on a project to view it in the 3D viewer
- Each semantic class (ceiling, floor, wall, beam, column, window, door) is colored differently

---

## Testing the Integration

### Test Python API Directly

```bash
# Test with a sample point cloud
curl -X POST -F "file=@your_sample.ply" \
  http://localhost:8000/process-simple \
  --output processed.ply
```

### Test via Deno Server

Check if the Deno server can reach the Python API:

```bash
curl https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-1d0df597/python-api-status
```

Expected response:
```json
{
  "success": true,
  "pythonApi": {
    "status": "online",
    "models_loaded": true
  },
  "url": "http://localhost:8000"
}
```

---

## Troubleshooting

### Python API Issues

**Problem: "Models not loaded"**
- Ensure `val_best.pth` is in `checkpoints/` directory
- Ensure `bimnet.py` is in `model/` directory
- Check file permissions

**Problem: "CUDA out of memory"**
- Reduce `CUBE_EDGE` in `app.py` from 128 to 64
- Use CPU mode instead: Edit `app.py` and set `DEVICE = "cpu"`

**Problem: "Module not found: open3d"**
- Reinstall dependencies: `pip install -r requirements.txt`

### Integration Issues

**Problem: "Cannot connect to Python API"**
- Verify Python API is running: `curl http://localhost:8000/`
- Check firewall settings
- If deployed, verify `PYTHON_API_URL` environment variable

**Problem: "Processing failed"**
- Check Python API logs for errors
- Verify point cloud file is valid `.ply` format
- Check if file size is reasonable (< 100MB recommended for first test)

**Problem: "Processed file same as original"**
- Check that Python API returned success
- Verify BIMNet model loaded correctly
- Check console logs in browser developer tools

---

## Production Deployment

### Deploy Python API

**Option 1: AWS EC2 with GPU**
1. Launch a p2 or g4 instance
2. Install CUDA and dependencies
3. Copy your model files
4. Run with systemd or supervisor
5. Set up nginx reverse proxy
6. Update `PYTHON_API_URL` environment variable

**Option 2: Google Cloud with GPU**
1. Create a Compute Engine instance with GPU
2. Follow similar steps as AWS

**Option 3: Docker**
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

### Update Environment Variables

In Supabase dashboard:
- Set `PYTHON_API_URL` to your deployed Python API URL
- Restart your Supabase Edge Function if needed

---

## API Endpoints Reference

### Python API

- `GET /` - Health check
- `POST /process-simple` - Process point cloud (returns single .ply)
- `POST /process` - Full processing with instances (returns .zip)

### Deno Server

- `GET /make-server-1d0df597/health` - Health check
- `POST /make-server-1d0df597/upload-pointcloud` - Upload original file
- `POST /make-server-1d0df597/process-pointcloud` - Process via Python API
- `GET /make-server-1d0df597/python-api-status` - Check Python API connection
- `POST /make-server-1d0df597/projects` - Save project metadata
- `GET /make-server-1d0df597/projects` - Get all projects
- `DELETE /make-server-1d0df597/projects/:id` - Delete project

---

## Performance Optimization

### For Large Point Clouds

1. **Downsample before upload** (in your scanning software)
2. **Reduce voxel resolution**: Edit `CUBE_EDGE` in Python API
3. **Use GPU**: Much faster than CPU (10-100x speedup)
4. **Batch processing**: Process multiple files overnight

### For Production

1. **Add caching**: Cache processed results
2. **Queue system**: Use Celery or Redis Queue for async processing
3. **Multiple workers**: Run multiple Python API instances
4. **CDN**: Use CloudFlare or AWS CloudFront for file delivery

---

## Support

If you encounter issues:

1. Check Python API logs: Look at terminal output
2. Check browser console: Developer tools → Console tab
3. Check Supabase logs: Supabase dashboard → Logs
4. Verify all files are in correct locations
5. Test each component separately before integration

---

## Summary Checklist

- [ ] Python dependencies installed
- [ ] `bimnet.py` in `python-api/model/`
- [ ] `val_best.pth` in `python-api/checkpoints/`
- [ ] Python API running on port 8000
- [ ] Database table created in Supabase
- [ ] `PYTHON_API_URL` environment variable set (if deployed)
- [ ] Can successfully upload and process a test file

Once all items are checked, your VizTwin system is ready to process point clouds with BIMNet semantic segmentation! 🎉
