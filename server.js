import cors from 'cors';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const listPlyFiles = async (dir, startTime) => {
  try {
    const entries = await fs.readdir(dir);
    const candidates = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry);
      const stats = await fs.stat(fullPath);
      if (!stats.isFile() || path.extname(entry).toLowerCase() !== '.ply') {
        return null;
      }
      if (stats.mtimeMs < startTime - 1000) {
        return null;
      }
      return { fullPath, mtimeMs: stats.mtimeMs };
    }));

    return candidates.filter(Boolean);
  } catch {
    return [];
  }
};

const findLatestOutput = async (inputPath, startTime) => {
  const outputDirs = [outputsDir, path.dirname(inputPath)];
  for (const dir of outputDirs) {
    const files = await listPlyFiles(dir, startTime);
    if (files.length > 0) {
      files.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return files[0].fullPath;
    }
  }
  return null;
};

const runPython = (scriptPath, args) => {
  return new Promise((resolve, reject) => {
    const pythonExec = process.env.PYTHON_EXEC || 'python';

    const fullArgs = [scriptPath, ...args];

    const child = spawn(pythonExec, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

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

const runPythonDetached = (scriptPath, args, onDone) => {
  const pythonExec = process.env.PYTHON_EXEC || 'python';
  const fullArgs = [scriptPath, ...args];
  const child = spawn(pythonExec, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.on('data', (chunk) => {
    console.log('[process-pointcloud] Instanced stdout:\n' + chunk.toString());
  });

  child.stderr.on('data', (chunk) => {
    console.warn('[process-pointcloud] Instanced stderr:\n' + chunk.toString());
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log('[process-pointcloud] Instanced processing complete');
    } else {
      console.warn('[process-pointcloud] Instanced processing failed with code:', code);
    }
    if (onDone) {
      onDone();
    }
  });
};

app.use(cors());
app.use('/outputs', express.static(outputsDir));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'Backend server is running', port: PORT });
});

app.post('/api/process-pointcloud', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'Missing file field: file' });
    return;
  }

  const inputPath = req.file.path;
  const startTime = Date.now();
  console.log('[process-pointcloud] Received file:', inputPath);
  console.log('[process-pointcloud] Output dir:', outputsDir);
  console.log('[process-pointcloud] Input size (bytes):', req.file.size);

  try {
    const checkpointPath = process.env.PYTHON_CHECKPOINT || 'C:\\Users\\iamsa\\Downloads\\val_best_miou.pth';
    const instancedScriptPath = process.env.PYTHON_SCRIPT || path.join(__dirname, 'viz_inst_runner.py');
    const semanticScriptPath = process.env.PYTHON_SEMANTIC_SCRIPT || path.join(__dirname, 'semantic_runner.py');

    const commonArgs = [
      '--input_file',
      inputPath,
      '--output_dir',
      outputsDir,
      '--checkpoint',
      checkpointPath,
      '--voxel_size',
      process.env.PLY_VOXEL_SIZE || '0.02'
    ];

    const instancedOutputName = `${path.parse(inputPath).name}_instanced.ply`;
    const semanticArgs = [...commonArgs];
    const instancedArgs = [...commonArgs, '--output_name', instancedOutputName];

    if (process.env.PYTHON_CPU === '1') {
      commonArgs.push('--cpu');
    }

    const semanticStart = Date.now();
    const semanticResult = await runPython(semanticScriptPath, semanticArgs);
    console.log('[process-pointcloud] Semantic duration (ms):', Date.now() - semanticStart);
    if (semanticResult.stdout) {
      console.log('[process-pointcloud] Semantic stdout:\n' + semanticResult.stdout);
    }
    if (semanticResult.stderr) {
      console.warn('[process-pointcloud] Semantic stderr:\n' + semanticResult.stderr);
    }

    console.log('[process-pointcloud] Starting instanced processing in background');
    runPythonDetached(instancedScriptPath, instancedArgs, async () => {
      try {
        await fs.unlink(inputPath);
        console.log('[process-pointcloud] Cleaned up input file:', inputPath);
      } catch {
        // Ignore cleanup failures.
      }
    });
    const semanticPath = path.join(outputsDir, `${path.parse(inputPath).name}_semantic.ply`);
    const instancedPath = path.join(outputsDir, instancedOutputName);

    const semanticUrl = `/outputs/${path.relative(outputsDir, semanticPath).split(path.sep).join('/')}`;
    const instancedUrl = `/outputs/${path.relative(outputsDir, instancedPath).split(path.sep).join('/')}`;

    const semanticExists = await fs.stat(semanticPath).then(() => true).catch(() => false);
    const instancedExists = await fs.stat(instancedPath).then(() => true).catch(() => false);

    if (!semanticExists) {
      console.warn('[process-pointcloud] Missing semantic output for input:', inputPath);
      res.status(500).json({
        success: false,
        error: 'Missing semantic output PLY after processing',
      });
      return;
    }
    console.log('[process-pointcloud] Semantic output:', semanticPath);
    if (instancedExists) {
      console.log('[process-pointcloud] Instanced output:', instancedPath);
    }
    console.log('[process-pointcloud] Total request duration (ms):', Date.now() - startTime);

    res.json({
      success: true,
      message: instancedExists
        ? 'Point cloud processed successfully'
        : 'Semantic output ready; instanced processing started',
      outputUrl: instancedExists ? instancedUrl : undefined,
      semanticUrl,
      instancedUrl: instancedExists ? instancedUrl : undefined,
      semanticFile: semanticPath,
      outputFile: instancedExists ? instancedPath : undefined
    });
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
    // Cleanup happens after background instanced processing completes.
  }
});

const startServer = async () => {
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
