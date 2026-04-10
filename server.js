import cors from 'cors';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadEnvFile = async (envFilePath) => {
  try {
    const raw = await fs.readFile(envFilePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
};

await loadEnvFile(path.join(__dirname, '.env'));

const app = express();
const PORT = Number(process.env.PORT || 3001);

const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'));
const outputsDir = path.resolve(process.env.OUTPUTS_DIR || path.join(__dirname, 'outputs'));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });
const modalBaseUrl = process.env.MODAL_ENDPOINT_URL?.replace(/\/$/, '');
const useModalPipeline = process.env.USE_MODAL_PIPELINE !== '0' && Boolean(modalBaseUrl);
const modalPollIntervalMs = Number(process.env.MODAL_POLL_INTERVAL_MS || 5000);
const modalJobTimeoutMs = Number(process.env.MODAL_JOB_TIMEOUT_MS || 60 * 60 * 1000);

const isAcceptedPointCloudUpload = (filename = '') => path.extname(filename).toLowerCase() === '.ply';

const toOutputUrl = (targetPath) =>
  `/outputs/${path.relative(outputsDir, targetPath).split(path.sep).join('/')}`;

const findLatestCombinedOutput = async (dir, startTime) => {
  const candidates = [];

  const walk = async (currentDir) => {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        return;
      }

      if (!entry.isFile() || entry.name !== 'all_instances_combined.ply') {
        return;
      }

      try {
        const stats = await fs.stat(fullPath);
        if (stats.mtimeMs >= startTime - 2000) {
          candidates.push({ fullPath, mtimeMs: stats.mtimeMs });
        }
      } catch {
        // Ignore file stat errors.
      }
    }));
  };

  await walk(dir);

  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].fullPath;
};

const listFilesRecursive = async (dir, rootDir = dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursive(fullPath, rootDir);
    }
    if (!entry.isFile()) {
      return [];
    }

    const stats = await fs.stat(fullPath);
    return [{
      relativePath: path.relative(rootDir, fullPath).split(path.sep).join('/'),
      size: stats.size,
      url: toOutputUrl(fullPath),
    }];
  }));

  return files.flat();
};

const runPython = (scriptPath, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const pythonExec = process.env.PYTHON_EXEC || 'python';

    const fullArgs = [scriptPath, ...args];
    const child = spawn(pythonExec, fullArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env || {}),
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject({ error, stdout, stderr });
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject({ error: new Error(`Python exited with code ${code}`), stdout, stderr, code });
    });
  });
};

const runFixturePipeline = async ({ inputPath }) => {
  const safeStem = path.parse(inputPath).name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const requestOutputDir = path.join(outputsDir, `${Date.now()}_${safeStem}`);
  await fs.mkdir(path.join(requestOutputDir, 'wall'), { recursive: true });

  const plyPayload = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
end_header
0 0 0
1 0 0
0 1 0
`;
  const bimJsonPayload = [
    {
      id: 'wall_0',
      type: 'wall',
      height: 3,
      thickness: 0.2,
      geometry: {
        start_x: 0,
        start_y: 0,
        start_z: 0,
        end_x: 1,
        end_y: 0,
        end_z: 0,
      },
    },
  ];

  await Promise.all([
    fs.writeFile(path.join(requestOutputDir, 'wall', 'wall_instance_000.ply'), plyPayload),
    fs.writeFile(path.join(requestOutputDir, 'all_instances_combined.ply'), plyPayload),
    fs.writeFile(path.join(requestOutputDir, 'instantiation_summary.json'), JSON.stringify({ wall: 1 }, null, 2)),
    fs.writeFile(path.join(requestOutputDir, 'bim_reconstruction_data.json'), JSON.stringify(bimJsonPayload, null, 2)),
    fs.writeFile(path.join(requestOutputDir, 'bim_model.ifc'), 'ISO-10303-21;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'),
    fs.writeFile(path.join(requestOutputDir, 'bim_model.obj'), 'o bim_model\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'),
    fs.writeFile(
      path.join(requestOutputDir, 'bim_model_properties.json'),
      JSON.stringify({ elements: [{ id: 'wall_0', type: 'wall' }] }, null, 2),
    ),
  ]);

  const instancedPath = path.join(requestOutputDir, 'all_instances_combined.ply');
  const bimIfcPath = path.join(requestOutputDir, 'bim_model.ifc');
  const bimObjPath = path.join(requestOutputDir, 'bim_model.obj');
  const bimPropsPath = path.join(requestOutputDir, 'bim_model_properties.json');

  return {
    success: true,
    message: 'Point cloud processed successfully via fixture pipeline',
    outputUrl: toOutputUrl(instancedPath),
    semanticUrl: toOutputUrl(instancedPath),
    instancedUrl: toOutputUrl(instancedPath),
    bimIfcUrl: toOutputUrl(bimIfcPath),
    bimObjUrl: toOutputUrl(bimObjPath),
    bimPropsUrl: toOutputUrl(bimPropsPath),
    semanticRelativePath: 'all_instances_combined.ply',
    instancedRelativePath: 'all_instances_combined.ply',
    bimIfcRelativePath: 'bim_model.ifc',
    bimObjRelativePath: 'bim_model.obj',
    bimPropsRelativePath: 'bim_model_properties.json',
    generatedFiles: await listFilesRecursive(requestOutputDir),
    outputFile: instancedPath,
    runOutputDir: requestOutputDir,
  };
};

const getModalAuthHeaders = () => {
  if (!process.env.MODAL_API_TOKEN) {
    return {};
  }

  return {
    Authorization: `Bearer ${process.env.MODAL_API_TOKEN}`,
  };
};

const ensureSuccessResponse = async (response, fallbackMessage) => {
  if (response.ok) {
    return response;
  }

  const payload = await response.json().catch(() => ({}));
  const message =
    payload?.error ||
    payload?.detail ||
    payload?.message ||
    `${fallbackMessage} (HTTP ${response.status})`;
  const error = new Error(message);
  error.statusCode = response.status;
  throw error;
};

const downloadFile = async (sourceUrl, targetPath) => {
  const response = await fetch(sourceUrl, {
    headers: getModalAuthHeaders(),
  });
  await ensureSuccessResponse(response, `Failed to download artifact from ${sourceUrl}`);

  const arrayBuffer = await response.arrayBuffer();
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, Buffer.from(arrayBuffer));
};

const normalizeGeneratedFiles = async (runDir, generatedFiles = []) => {
  return Promise.all(generatedFiles.map(async (generatedFile) => {
    const fullPath = path.join(runDir, generatedFile.relativePath);
    const size = generatedFile.size ?? await fs.stat(fullPath).then((stats) => stats.size);
    return {
      relativePath: generatedFile.relativePath,
      size,
      url: toOutputUrl(fullPath),
    };
  }));
};

const hydrateModalResultToLocal = async (modalResult, requestOutputDir) => {
  const generatedFiles = modalResult.generatedFiles || [];
  await Promise.all(generatedFiles.map(async (generatedFile) => {
    const targetPath = path.join(requestOutputDir, generatedFile.relativePath);
    await downloadFile(generatedFile.url, targetPath);
  }));

  const instancedRelativePath = modalResult.instancedRelativePath || modalResult.semanticRelativePath;
  if (!instancedRelativePath) {
    throw new Error('Modal job finished without an instancedRelativePath.');
  }

  const instancedPath = path.join(requestOutputDir, instancedRelativePath);
  const bimIfcPath = modalResult.bimIfcRelativePath
    ? path.join(requestOutputDir, modalResult.bimIfcRelativePath)
    : null;
  const bimObjPath = modalResult.bimObjRelativePath
    ? path.join(requestOutputDir, modalResult.bimObjRelativePath)
    : null;
  const bimPropsPath = modalResult.bimPropsRelativePath
    ? path.join(requestOutputDir, modalResult.bimPropsRelativePath)
    : null;

  return {
    success: true,
    message: modalResult.message || 'Point cloud processed successfully via Modal pipeline',
    outputUrl: toOutputUrl(instancedPath),
    semanticUrl: toOutputUrl(instancedPath),
    instancedUrl: toOutputUrl(instancedPath),
    bimIfcUrl: bimIfcPath ? toOutputUrl(bimIfcPath) : undefined,
    bimObjUrl: bimObjPath ? toOutputUrl(bimObjPath) : undefined,
    bimPropsUrl: bimPropsPath ? toOutputUrl(bimPropsPath) : undefined,
    semanticRelativePath: modalResult.semanticRelativePath || instancedRelativePath,
    instancedRelativePath,
    bimIfcRelativePath: modalResult.bimIfcRelativePath || undefined,
    bimObjRelativePath: modalResult.bimObjRelativePath || undefined,
    bimPropsRelativePath: modalResult.bimPropsRelativePath || undefined,
    generatedFiles: await normalizeGeneratedFiles(requestOutputDir, generatedFiles),
    outputFile: instancedPath,
    runOutputDir: requestOutputDir,
  };
};

const waitForModalResult = async (jobId) => {
  const startTime = Date.now();

  while (Date.now() - startTime < modalJobTimeoutMs) {
    const response = await fetch(`${modalBaseUrl}/jobs/${encodeURIComponent(jobId)}/result`, {
      headers: getModalAuthHeaders(),
    });

    if (response.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, modalPollIntervalMs));
      continue;
    }

    await ensureSuccessResponse(response, `Modal job ${jobId} failed`);
    return response.json();
  }

  throw new Error(`Timed out waiting for Modal job ${jobId} after ${modalJobTimeoutMs}ms.`);
};

const runModalPipeline = async ({ inputPath, originalName }) => {
  if (!modalBaseUrl) {
    throw new Error('MODAL_ENDPOINT_URL is not configured.');
  }
  console.log(`[process-pointcloud] Using Modal pipeline: ${modalBaseUrl}`);
  const safeStem = path.parse(originalName).name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const requestOutputDir = path.join(outputsDir, `${Date.now()}_${safeStem}`);
  await fs.mkdir(requestOutputDir, { recursive: true });

  const fileBuffer = await fs.readFile(inputPath);
  const body = new FormData();
  body.append('file', new Blob([fileBuffer]), originalName);

  const submitResponse = await fetch(`${modalBaseUrl}/process`, {
    method: 'POST',
    headers: getModalAuthHeaders(),
    body,
  });
  await ensureSuccessResponse(submitResponse, 'Failed to submit Modal point cloud job');

  const submitPayload = await submitResponse.json();
  if (!submitPayload?.jobId) {
    throw new Error('Modal submit response did not include a jobId.');
  }
  console.log(`[process-pointcloud] Modal job submitted: ${submitPayload.jobId}`);

  const modalResult = await waitForModalResult(submitPayload.jobId);
  console.log(`[process-pointcloud] Modal job completed: ${submitPayload.jobId}`);
  return hydrateModalResultToLocal(modalResult, requestOutputDir);
};

const runLocalPipeline = async ({ inputPath, startTime }) => {
  console.log('[process-pointcloud] Using local Python fallback pipeline');
  if (process.env.TEST_STUB_PIPELINE === '1') {
    console.log('[process-pointcloud] TEST_STUB_PIPELINE enabled');
    return runFixturePipeline({ inputPath });
  }

  const checkpointPath = process.env.PYTHON_CHECKPOINT || path.join(__dirname, 'models', 'val_best_miou.pth');
  const vizInstScriptPath = process.env.PYTHON_SCRIPT || path.join(__dirname, 'vizainst.py');
  const cloud2BimDir = process.env.CLOUD2BIM_DIR || __dirname;
  const json2IfcScriptPath = process.env.PYTHON_JSON2IFC_SCRIPT || path.join(__dirname, 'json2ifc.py');
  const ifcObjExporterScriptPath = process.env.PYTHON_IFC_EXPORTER_SCRIPT || path.join(__dirname, 'ifc_obj_exporter.py');
  const enableBimPreview = process.env.ENABLE_BIM_PREVIEW !== '0';
  const safeStem = path.parse(inputPath).name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const requestOutputDir = path.join(outputsDir, `${Date.now()}_${safeStem}`);
  await fs.mkdir(requestOutputDir, { recursive: true });

  const vizInstArgs = [
    '--input_file',
    inputPath,
    '--checkpoint',
    checkpointPath,
    '--output_dir',
    requestOutputDir,
    '--no-vis-instances'
  ];

  if (process.env.PYTHON_CPU === '1') {
    vizInstArgs.push('--cpu');
  }

  const runStart = Date.now();
  console.log('[process-pointcloud] Python script:', vizInstScriptPath);
  const result = await runPython(vizInstScriptPath, vizInstArgs, {
    env: {
      DISABLE_OPEN3D_VISUALIZER: '1',
    },
  });
  console.log('[process-pointcloud] vizainst.py duration (ms):', Date.now() - runStart);
  if (result.stdout) {
    console.log('[process-pointcloud] vizainst.py stdout:\n' + result.stdout);
  }
  if (result.stderr) {
    console.warn('[process-pointcloud] vizainst.py stderr:\n' + result.stderr);
  }

  const runDirMatch = result.stdout?.match(/Run output directory:\s*(.+)/i);
  const parsedRunDir = runDirMatch?.[1]?.trim();
  let instancedPath = parsedRunDir
    ? path.resolve(parsedRunDir, 'all_instances_combined.ply')
    : null;

  const instancedExists = instancedPath
    ? await fs.stat(instancedPath).then(() => true).catch(() => false)
    : false;

  if (!instancedExists) {
    instancedPath = await findLatestCombinedOutput(requestOutputDir, startTime);
  }

  if (!instancedPath) {
    throw new Error('Missing all_instances_combined.ply after vizainst.py processing');
  }

  console.log('[process-pointcloud] Instanced output:', instancedPath);

  const runDir = path.dirname(instancedPath);
  const bimJsonPath = path.join(runDir, 'bim_reconstruction_data.json');
  const bimIfcPath = path.join(runDir, 'bim_model.ifc');
  const bimObjPath = path.join(runDir, 'bim_model.obj');
  const bimPropsPath = path.join(runDir, 'bim_model_properties.json');

  const hasBimJson = await fs.stat(bimJsonPath).then(() => true).catch(() => false);
  let bimIfcUrl;
  let bimObjUrl;
  let bimPropsUrl;

  if (hasBimJson && enableBimPreview) {
    try {
      const json2IfcArgs = [
        '--input_json',
        bimJsonPath,
        '--output_ifc',
        bimIfcPath,
        '--no-view-ifc',
      ];
      const ifcResult = await runPython(json2IfcScriptPath, json2IfcArgs, { cwd: cloud2BimDir });
      if (ifcResult.stdout) {
        console.log('[process-pointcloud] json2ifc.py stdout:\n' + ifcResult.stdout);
      }
      if (ifcResult.stderr) {
        console.warn('[process-pointcloud] json2ifc.py stderr:\n' + ifcResult.stderr);
      }

      const exportArgs = [
        '--ifc_path',
        bimIfcPath,
        '--obj_path',
        bimObjPath,
        '--props_path',
        bimPropsPath,
      ];
      const exportResult = await runPython(ifcObjExporterScriptPath, exportArgs);
      if (exportResult.stdout) {
        console.log('[process-pointcloud] ifc_obj_exporter.py stdout:\n' + exportResult.stdout);
      }
      if (exportResult.stderr) {
        console.warn('[process-pointcloud] ifc_obj_exporter.py stderr:\n' + exportResult.stderr);
      }

      const hasIfc = await fs.stat(bimIfcPath).then(() => true).catch(() => false);
      const hasObj = await fs.stat(bimObjPath).then(() => true).catch(() => false);
      const hasProps = await fs.stat(bimPropsPath).then(() => true).catch(() => false);
      if (hasIfc) {
        bimIfcUrl = toOutputUrl(bimIfcPath);
      }
      if (hasObj) {
        bimObjUrl = toOutputUrl(bimObjPath);
      }
      if (hasProps) {
        bimPropsUrl = toOutputUrl(bimPropsPath);
      }
    } catch (bimError) {
      console.warn('[process-pointcloud] BIM conversion failed:', bimError?.message || bimError);
    }
  } else if (hasBimJson) {
    console.log('[process-pointcloud] Skipping Cloud2BIM IFC/OBJ conversion because ENABLE_BIM_PREVIEW=0');
  } else {
    console.warn('[process-pointcloud] Missing bim_reconstruction_data.json at', bimJsonPath);
  }

  const instancedUrl = toOutputUrl(instancedPath);
  const generatedFiles = await listFilesRecursive(runDir);

  return {
    success: true,
    message: 'Point cloud processed successfully via vizainst.py pipeline',
    outputUrl: instancedUrl,
    semanticUrl: instancedUrl,
    instancedUrl,
    bimIfcUrl,
    bimObjUrl,
    bimPropsUrl,
    semanticRelativePath: path.relative(runDir, instancedPath).split(path.sep).join('/'),
    instancedRelativePath: path.relative(runDir, instancedPath).split(path.sep).join('/'),
    bimIfcRelativePath: bimIfcUrl ? path.relative(runDir, bimIfcPath).split(path.sep).join('/') : undefined,
    bimObjRelativePath: bimObjUrl ? path.relative(runDir, bimObjPath).split(path.sep).join('/') : undefined,
    bimPropsRelativePath: bimPropsUrl ? path.relative(runDir, bimPropsPath).split(path.sep).join('/') : undefined,
    generatedFiles,
    outputFile: instancedPath,
    runOutputDir: runDir,
  };
};

app.use(cors());
app.use('/outputs', express.static(outputsDir));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'Backend server is running', port: PORT });
});

app.get('/api/modal-status', async (_req, res) => {
  if (!modalBaseUrl) {
    res.json({
      connected: false,
      mode: 'local',
      message: 'MODAL_ENDPOINT_URL is not configured. Using local Python fallback.',
    });
    return;
  }

  if (!useModalPipeline) {
    res.json({
      connected: false,
      mode: 'local',
      endpoint: modalBaseUrl,
      message: 'MODAL_ENDPOINT_URL is configured, but USE_MODAL_PIPELINE=0 forces local Python fallback.',
    });
    return;
  }

  try {
    const response = await fetch(`${modalBaseUrl}/health`, {
      headers: getModalAuthHeaders(),
    });
    await ensureSuccessResponse(response, 'Modal health check failed');
    const payload = await response.json();
    res.json({
      connected: true,
      mode: 'modal',
      endpoint: modalBaseUrl,
      health: payload,
    });
  } catch (error) {
    res.status(503).json({
      connected: false,
      mode: 'modal',
      endpoint: modalBaseUrl,
      message: error instanceof Error ? error.message : 'Unknown Modal connection error',
    });
  }
});

app.post('/api/process-pointcloud', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'Missing file field: file' });
    return;
  }

  if (!isAcceptedPointCloudUpload(req.file.originalname)) {
    try {
      await fs.unlink(req.file.path);
    } catch {
      // Ignore cleanup failures for invalid uploads.
    }

    res.status(400).json({
      success: false,
      error: 'Invalid file type. Only .ply uploads are supported.',
    });
    return;
  }

  const inputPath = req.file.path;
  const startTime = Date.now();
  console.log(`[process-pointcloud] Mode for this request: ${useModalPipeline ? 'Modal' : 'local Python fallback'}`);
  console.log('[process-pointcloud] Received file:', inputPath);
  console.log('[process-pointcloud] Output dir:', outputsDir);
  console.log('[process-pointcloud] Input size (bytes):', req.file.size);

  try {
    const processingResult = useModalPipeline
      ? await runModalPipeline({ inputPath, originalName: req.file.originalname })
      : await runLocalPipeline({ inputPath, startTime });

    console.log('[process-pointcloud] Total request duration (ms):', Date.now() - startTime);
    res.json(processingResult);
  } catch (err) {
    const errorMessage = err?.error?.message || err?.message || 'Python processing failed';
    if (err?.stdout) {
      console.log('[process-pointcloud] Python stdout (error):\n' + err.stdout);
    }
    if (err?.stderr) {
      console.warn('[process-pointcloud] Python stderr (error):\n' + err.stderr);
    }
    console.error('[process-pointcloud] Python failed:', errorMessage);
    res.status(500).json({
      success: false,
      error: errorMessage,
      code: err?.code,
      pythonOutput: err?.stderr || ''
    });
  } finally {
    try {
      await fs.unlink(inputPath);
      console.log('[process-pointcloud] Cleaned up input file:', inputPath);
    } catch {
      // Ignore cleanup failures.
    }
  }
});

const startServer = async () => {
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });

  if (modalBaseUrl && useModalPipeline) {
    try {
      const response = await fetch(`${modalBaseUrl}/health`, {
        headers: getModalAuthHeaders(),
      });
      await ensureSuccessResponse(response, 'Modal health check failed during startup');
      const payload = await response.json();
      console.log(`[startup] Modal connected: ${modalBaseUrl} ${JSON.stringify(payload)}`);
    } catch (error) {
      console.warn(`[startup] Modal configured but unreachable: ${modalBaseUrl}`);
      console.warn(`[startup] Modal connection error: ${error instanceof Error ? error.message : error}`);
    }
  } else if (modalBaseUrl) {
    console.log('[startup] Modal endpoint configured but disabled via USE_MODAL_PIPELINE=0. Using local Python fallback.');
  } else {
    console.log('[startup] Modal not configured. Using local Python fallback.');
  }

  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`[startup] Point cloud processing mode: ${useModalPipeline ? `Modal (${modalBaseUrl})` : 'local Python fallback'}`);
      resolve(server);
    });
  });
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { app, startServer };
