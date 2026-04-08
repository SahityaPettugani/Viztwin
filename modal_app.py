import json
import mimetypes
import os
import re
import subprocess
import traceback
import uuid
from pathlib import Path
from typing import Any

import modal


APP_NAME = os.environ.get("MODAL_APP_NAME", "viztwin-pointcloud")
DATA_ROOT = Path("/root/data")
APP_ROOT = Path("/root/app")
JOBS_ROOT = DATA_ROOT / "jobs"
VOLUME_NAME = os.environ.get("MODAL_VOLUME_NAME", "viztwin-pointcloud-data")
GPU_TYPE = os.environ.get("MODAL_GPU") or None
PIPELINE_TIMEOUT_SECONDS = int(os.environ.get("MODAL_PIPELINE_TIMEOUT_SECONDS", "3600"))

app = modal.App(APP_NAME)
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("fastapi==0.115.6", "python-multipart==0.0.20")
    .pip_install_from_requirements("requirements.txt")
    .add_local_dir("model", remote_path="/root/app/model")
    .add_local_dir("models", remote_path="/root/app/models")
    .add_local_file("requirements.txt", remote_path="/root/app/requirements.txt")
    .add_local_file("vizainst.py", remote_path="/root/app/vizainst.py")
    .add_local_file("json2ifc.py", remote_path="/root/app/json2ifc.py")
    .add_local_file("ifc_obj_exporter.py", remote_path="/root/app/ifc_obj_exporter.py")
    .add_local_file("generate_ifc.py", remote_path="/root/app/generate_ifc.py")
)


FUNCTION_KWARGS: dict[str, Any] = {
    "image": image,
    "volumes": {str(DATA_ROOT): volume},
    "timeout": PIPELINE_TIMEOUT_SECONDS,
}

if GPU_TYPE:
    FUNCTION_KWARGS["gpu"] = GPU_TYPE


def safe_name(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", name)


def to_rel_path(file_path: Path, root_dir: Path) -> str:
    return file_path.relative_to(root_dir).as_posix()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_json(path: Path, default: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path.exists():
        return default or {}
    return json.loads(path.read_text(encoding="utf-8"))


def update_status(job_id: str, **fields: Any) -> dict[str, Any]:
    status_path = JOBS_ROOT / job_id / "status.json"
    payload = read_json(status_path, {"jobId": job_id})
    payload.update(fields)
    write_json(status_path, payload)
    volume.commit()
    return payload


def save_result(job_id: str, payload: dict[str, Any]) -> None:
    result_path = JOBS_ROOT / job_id / "result.json"
    write_json(result_path, payload)
    volume.commit()


async def update_status_async(job_id: str, **fields: Any) -> dict[str, Any]:
    status_path = JOBS_ROOT / job_id / "status.json"
    payload = read_json(status_path, {"jobId": job_id})
    payload.update(fields)
    write_json(status_path, payload)
    await volume.commit.aio()
    return payload


async def save_result_async(job_id: str, payload: dict[str, Any]) -> None:
    result_path = JOBS_ROOT / job_id / "result.json"
    write_json(result_path, payload)
    await volume.commit.aio()


def run_python(script_name: str, args: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> dict[str, str]:
    command = ["python", script_name, *args]
    completed = subprocess.run(
        command,
        cwd=str(cwd or APP_ROOT),
        env={**os.environ, **(env or {})},
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        error = RuntimeError(f"{script_name} exited with code {completed.returncode}")
        setattr(error, "stdout", completed.stdout)
        setattr(error, "stderr", completed.stderr)
        setattr(error, "returncode", completed.returncode)
        raise error
    return {"stdout": completed.stdout, "stderr": completed.stderr}


def find_latest_combined_output(dir_path: Path, start_time: float) -> Path | None:
    candidates: list[tuple[float, Path]] = []
    for file_path in dir_path.rglob("all_instances_combined.ply"):
        try:
            mtime = file_path.stat().st_mtime
        except OSError:
            continue
        if mtime >= start_time - 2:
            candidates.append((mtime, file_path))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def list_files_recursive(dir_path: Path, root_dir: Path | None = None) -> list[dict[str, Any]]:
    root = root_dir or dir_path
    files: list[dict[str, Any]] = []
    for file_path in sorted(dir_path.rglob("*")):
        if not file_path.is_file():
            continue
        files.append(
            {
                "relativePath": to_rel_path(file_path, root),
                "size": file_path.stat().st_size,
            }
        )
    return files


def build_result(job_id: str, request: Any = None) -> dict[str, Any]:
    from fastapi import HTTPException

    result_path = JOBS_ROOT / job_id / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Result not found.")

    payload = read_json(result_path, {})
    base_url = None
    if request is not None:
        base_url = str(request.base_url).rstrip("/")

    def artifact_url(relative_path: str) -> str:
        quoted = "/".join(part for part in relative_path.split("/") if part)
        if base_url:
            return f"{base_url}/jobs/{job_id}/artifacts/{quoted}"
        return f"/jobs/{job_id}/artifacts/{quoted}"

    generated_files = []
    for generated_file in payload.get("generatedFiles", []):
        relative_path = generated_file["relativePath"]
        generated_files.append(
            {
                **generated_file,
                "url": artifact_url(relative_path),
            }
        )

    for url_key, relative_key in (
        ("outputUrl", "instancedRelativePath"),
        ("semanticUrl", "semanticRelativePath"),
        ("instancedUrl", "instancedRelativePath"),
        ("bimIfcUrl", "bimIfcRelativePath"),
        ("bimObjUrl", "bimObjRelativePath"),
        ("bimPropsUrl", "bimPropsRelativePath"),
    ):
        relative_path = payload.get(relative_key)
        if relative_path:
            payload[url_key] = artifact_url(relative_path)

    payload["generatedFiles"] = generated_files
    payload["jobId"] = job_id
    return payload


@app.function(**FUNCTION_KWARGS)
def run_pipeline(job_id: str, input_filename: str, enable_bim_preview: bool = True, force_cpu: bool = False) -> dict[str, Any]:
    try:
        volume.reload()
        job_dir = JOBS_ROOT / job_id
        input_path = job_dir / "input" / input_filename
        output_root = job_dir / "outputs"
        output_root.mkdir(parents=True, exist_ok=True)
        volume.commit()

        checkpoint_path = Path(os.environ.get("PYTHON_CHECKPOINT", str(APP_ROOT / "models" / "val_best_miou.pth")))
        if not input_path.exists():
            raise FileNotFoundError(f"Input point cloud not found: {input_path}")
        start_time = input_path.stat().st_mtime

        update_status(
            job_id,
            status="running",
            step="vizainst",
            inputFilename=input_filename,
        )

        safe_stem = safe_name(input_path.stem)
        request_output_dir = output_root / f"{job_id}_{safe_stem}"
        request_output_dir.mkdir(parents=True, exist_ok=True)
        volume.commit()

        vizinst_args = [
            "--input_file",
            str(input_path),
            "--checkpoint",
            str(checkpoint_path),
            "--output_dir",
            str(request_output_dir),
            "--no-vis-instances",
        ]
        if force_cpu:
            vizinst_args.append("--cpu")

        vizinst_result = run_python(
            "vizainst.py",
            vizinst_args,
            env={"DISABLE_OPEN3D_VISUALIZER": "1"},
        )

        run_dir_match = re.search(r"Run output directory:\s*(.+)", vizinst_result["stdout"] or "", re.IGNORECASE)
        instanced_path = Path(run_dir_match.group(1).strip()) / "all_instances_combined.ply" if run_dir_match else None
        if not instanced_path or not instanced_path.exists():
            instanced_path = find_latest_combined_output(request_output_dir, start_time)
        if not instanced_path or not instanced_path.exists():
            raise FileNotFoundError("Missing all_instances_combined.ply after vizainst.py processing")

        run_dir = instanced_path.parent
        bim_json_path = run_dir / "bim_reconstruction_data.json"
        bim_ifc_path = run_dir / "bim_model.ifc"
        bim_obj_path = run_dir / "bim_model.obj"
        bim_props_path = run_dir / "bim_model_properties.json"

        if bim_json_path.exists() and enable_bim_preview:
            update_status(job_id, status="running", step="ifc")
            run_python(
                "json2ifc.py",
                [
                    "--input_json",
                    str(bim_json_path),
                    "--output_ifc",
                    str(bim_ifc_path),
                    "--no-view-ifc",
                ],
            )
            run_python(
                "ifc_obj_exporter.py",
                [
                    "--ifc_path",
                    str(bim_ifc_path),
                    "--obj_path",
                    str(bim_obj_path),
                    "--props_path",
                    str(bim_props_path),
                ],
            )

        generated_files = list_files_recursive(run_dir)
        result = {
            "success": True,
            "message": "Point cloud processed successfully via Modal pipeline",
            "runRelativeDir": to_rel_path(run_dir, job_dir),
            "semanticRelativePath": to_rel_path(instanced_path, run_dir),
            "instancedRelativePath": to_rel_path(instanced_path, run_dir),
            "bimIfcRelativePath": to_rel_path(bim_ifc_path, run_dir) if bim_ifc_path.exists() else None,
            "bimObjRelativePath": to_rel_path(bim_obj_path, run_dir) if bim_obj_path.exists() else None,
            "bimPropsRelativePath": to_rel_path(bim_props_path, run_dir) if bim_props_path.exists() else None,
            "generatedFiles": generated_files,
            "stdout": {
                "vizainst": vizinst_result["stdout"],
            },
            "stderr": {
                "vizainst": vizinst_result["stderr"],
            },
        }
        save_result(job_id, result)
        update_status(job_id, status="completed", step="completed")
        return result
    except Exception as exc:
        failure = {
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
            "stdout": getattr(exc, "stdout", ""),
            "stderr": getattr(exc, "stderr", ""),
        }
        save_result(job_id, failure)
        update_status(job_id, status="failed", step="failed", error=str(exc))
        raise


@app.function(image=image, volumes={str(DATA_ROOT): volume})
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI, File, HTTPException, Request, UploadFile
    from fastapi.responses import FileResponse, JSONResponse

    web_app = FastAPI(title="VizTwin Modal Processing")

    @web_app.get("/health")
    async def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    @web_app.post("/process")
    async def submit_process_job(file: UploadFile = File(...)) -> JSONResponse:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Missing uploaded filename.")

        safe_filename = safe_name(file.filename)
        job_id = uuid.uuid4().hex
        job_input_dir = JOBS_ROOT / job_id / "input"
        job_input_dir.mkdir(parents=True, exist_ok=True)

        input_path = job_input_dir / safe_filename
        input_path.write_bytes(await file.read())
        await volume.commit.aio()

        function_call = await run_pipeline.spawn.aio(
            job_id=job_id,
            input_filename=safe_filename,
            enable_bim_preview=os.environ.get("ENABLE_BIM_PREVIEW", "1") != "0",
            force_cpu=os.environ.get("PYTHON_CPU", "0") == "1",
        )

        await update_status_async(
            job_id,
            status="queued",
            step="queued",
            callId=function_call.object_id,
            inputFilename=safe_filename,
        )

        return JSONResponse(
            {
                "success": True,
                "jobId": job_id,
                "callId": function_call.object_id,
                "status": "queued",
            }
        )

    @web_app.get("/jobs/{job_id}")
    async def get_job_status(job_id: str) -> JSONResponse:
        await volume.reload.aio()
        status_path = JOBS_ROOT / job_id / "status.json"
        if not status_path.exists():
            raise HTTPException(status_code=404, detail="Job not found.")
        return JSONResponse(read_json(status_path, {"jobId": job_id}))

    @web_app.get("/jobs/{job_id}/result")
    async def get_job_result(job_id: str, request: Request) -> JSONResponse:
        await volume.reload.aio()
        status_path = JOBS_ROOT / job_id / "status.json"
        if not status_path.exists():
            raise HTTPException(status_code=404, detail="Job not found.")

        status = read_json(status_path, {"jobId": job_id})
        if status.get("status") in {"queued", "running"}:
            call_id = status.get("callId")
            if call_id:
                function_call = modal.FunctionCall.from_id(call_id)
                try:
                    await function_call.get.aio(timeout=0)
                    await volume.reload.aio()
                    status = read_json(status_path, {"jobId": job_id})
                except TimeoutError:
                    return JSONResponse(status_code=202, content=status)
                except Exception as exc:
                    failure = {
                        "success": False,
                        "error": str(exc),
                    }
                    await save_result_async(job_id, failure)
                    await update_status_async(job_id, status="failed", step="failed", error=str(exc))
                    await volume.reload.aio()
                    status = read_json(status_path, {"jobId": job_id})
            else:
                return JSONResponse(status_code=202, content=status)

        await volume.reload.aio()
        result = build_result(job_id, request)
        if result.get("success"):
            return JSONResponse(result)
        return JSONResponse(status_code=500, content=result)

    @web_app.get("/jobs/{job_id}/artifacts/{artifact_path:path}", name="download_artifact")
    async def download_artifact(job_id: str, artifact_path: str):
        await volume.reload.aio()
        normalized = Path(artifact_path)
        if normalized.is_absolute() or ".." in normalized.parts:
            raise HTTPException(status_code=400, detail="Invalid artifact path.")

        job_dir = JOBS_ROOT / job_id
        result_path = job_dir / "result.json"
        if not result_path.exists():
            raise HTTPException(status_code=404, detail="Job result not found.")

        result = read_json(result_path, {})
        run_relative_dir = result.get("runRelativeDir")
        if not run_relative_dir:
            raise HTTPException(status_code=404, detail="Run directory not recorded.")

        artifact_file = job_dir / run_relative_dir / normalized
        if not artifact_file.exists() or not artifact_file.is_file():
            raise HTTPException(status_code=404, detail="Artifact not found.")

        media_type, _ = mimetypes.guess_type(str(artifact_file))
        return FileResponse(path=str(artifact_file), media_type=media_type or "application/octet-stream")

    return web_app
