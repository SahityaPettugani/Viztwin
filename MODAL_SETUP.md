# Modal deployment

This project now supports running the point-cloud pipeline on Modal while keeping the VizTwin UI on `localhost`.

## Files

- `modal_app.py`: Modal web app and remote processing pipeline.
- `server.js`: Uses Modal when `MODAL_ENDPOINT_URL` is set, otherwise falls back to local Python execution.

## 1. Install Modal locally

```bash
pip install modal
modal setup
```

## 2. Deploy the Modal app

From the project root:

```bash
modal deploy modal_app.py
```

After deploy, copy the generated public base URL and set it as:

```env
MODAL_ENDPOINT_URL=https://<your-modal-app>.modal.run
```

## 3. Optional Modal environment variables

Set these before deploying if you need them:

```env
MODAL_APP_NAME=viztwin-pointcloud
MODAL_VOLUME_NAME=viztwin-pointcloud-data
MODAL_GPU=T4
MODAL_PIPELINE_TIMEOUT_SECONDS=3600
PYTHON_CPU=0
ENABLE_BIM_PREVIEW=1
PYTHON_CHECKPOINT=/root/app/models/val_best_miou.pth
```

## 4. Run VizTwin locally

Keep your normal local workflow:

```bash
npm run server
npm run dev
```

When `MODAL_ENDPOINT_URL` is present, `/api/process-pointcloud` will:

1. upload the `.ply` to Modal
2. wait for the remote job to finish
3. download generated artifacts back into local `outputs/`
4. return the same response shape the frontend already expects

## Notes

- The local upload entrypoint still enforces the `2 GB` upload limit before the file is handed off to Modal.
- If `MODAL_ENDPOINT_URL` is missing, the backend still runs the original local Python pipeline.
- The first Modal request may be slower because of image build and cold start.
- If your model requires GPU, set `MODAL_GPU` before `modal deploy`.
- The downloaded `all_instances_combined.ply` output is expected to contain globally unique colors per instance.
