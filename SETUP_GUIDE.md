# VizTwin Local And Deployment Setup

This guide matches the current application wiring in this repository.

## Architecture Overview

```text
Frontend (React + Vite) -> Local Node/Express server -> BACKEND/scantobim/viz_2.py
                                                    -> BACKEND/cloud2bim/json2ifc.py
                                                    -> outputs/
```

`python-api/app.py` is a separate FastAPI experiment and is not the path used by the frontend upload flow.

## Local Development

### Prerequisites

- Node.js and npm
- Python environment with the packages needed by `BACKEND/scantobim/viz_2.py`
- A valid BIMNet checkpoint file
- The backend folders:
  - `BACKEND/scantobim`
  - `BACKEND/cloud2bim`

### Backend Paths

The local Node server expects these files by default:

- `BACKEND/scantobim/viz_2.py`
- `BACKEND/scantobim/log/val_best_miou.pth`
- `BACKEND/cloud2bim/json2ifc.py`
- `ifc_obj_exporter.py`

You can override any of them with environment variables in `.env`.

### Recommended `.env`

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_STORAGE_BUCKET=project-assets

PYTHON_EXEC=python
SCANTOBIM_DIR=BACKEND\scantobim
CLOUD2BIM_DIR=BACKEND\cloud2bim
PYTHON_SCRIPT=BACKEND\scantobim\viz_2.py
PYTHON_CHECKPOINT=BACKEND\scantobim\log\val_best_miou.pth
PYTHON_JSON2IFC_SCRIPT=BACKEND\cloud2bim\json2ifc.py
PYTHON_IFC_EXPORTER_SCRIPT=ifc_obj_exporter.py
ENABLE_BIM_PREVIEW=1
```

### Start The App

Run the backend and frontend together from the `Viztwin` folder:

```bash
npm run dev-all
```

That starts:

- the Node server on `http://localhost:3001`
- the Vite frontend on its usual local dev port

### Verify The Local Server

Check the health endpoint:

```bash
curl http://localhost:3001/api/health
```

You should see the backend status plus the resolved script and checkpoint paths.

When you upload a point cloud from the UI, the flow is:

1. Frontend calls `/api/process-pointcloud`
2. Vite proxies that request to `http://localhost:3001`
3. `server.js` runs `viz_2.py`
4. Optional BIM conversion runs through `json2ifc.py`
5. Results are served back from `/outputs`

### Upload And Output Behavior

- Uploads are limited to `2 GB`
- The browser upload UI accepts `.ply` files only
- `viz_2.py` also validates the input file before loading it, including the size cap
- The combined output file `all_instances_combined.ply` now assigns a different color to every instance globally, instead of restarting colors per class
- Individual instance files are still written under class folders inside the request output directory

## Deployment Notes

For deployment, the frontend dev proxy is not enough by itself.

### What Must Change

- Deploy the Node server somewhere that can run Python
- Keep `viz_2.py`, the checkpoint, and `cloud2bim` on that same machine or container
- Set real environment variables on the host instead of relying on local defaults
- Expose the Node server as your production API origin
- Point the production frontend to that API origin

### Good Deployment Shape

Use this split:

- Static frontend deployment for the React app
- Separate backend deployment for `server.js`
- Python dependencies installed on the backend host
- Persistent or mounted storage for `uploads/` and `outputs/`

### Important Production Considerations

- The Vite proxy in development only works locally
- `outputs/` is local disk storage, so it will not survive ephemeral server instances unless you mount storage or move artifacts to object storage
- Large point cloud processing can take time, memory, and possibly GPU access
- If you deploy behind a reverse proxy, make sure file upload limits are set to at least `2 GB` and request timeouts are increased appropriately

## Troubleshooting

### Server Starts But Upload Fails

- Check the Node server logs first
- Check whether the uploaded file exceeded the `2 GB` cap
- Confirm the checkpoint file exists at the resolved path
- Confirm the Python environment used by `PYTHON_EXEC` can import all required packages
- Confirm `viz_2.py` can run from `BACKEND/scantobim`

### Health Endpoint Works But Processing Fails

- Look for `Python stdout` and `Python stderr` in the Node logs
- Check whether `all_instances_combined.ply` was created in `outputs/`
- If colors in the combined instance output look repeated by class, make sure you are using the current `BACKEND/scantobim/viz_2.py`
- If IFC generation fails, verify `json2ifc.py` and `ifc_obj_exporter.py`

### Frontend Cannot Reach Backend In Production

- The frontend must call the deployed backend URL, not `/api` unless both are served from the same origin
- If you keep different origins, configure CORS on the Node server appropriately
