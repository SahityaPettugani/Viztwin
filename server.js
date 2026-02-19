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
    const vizInstScriptPath = process.env.PYTHON_SCRIPT || 'C:\\Users\\iamsa\\Downloads\\scan2bim\\viz_inst.py';
    const vizInstArgs = [
      '--input_file',
      inputPath,
      '--checkpoint',
      checkpointPath,
      '--output_dir',
      outputsDir,
      '--no-vis-instances'
    ];

    if (process.env.PYTHON_CPU === '1') {
      vizInstArgs.push('--cpu');
    }

    const runStart = Date.now();
    const result = await runPython(vizInstScriptPath, vizInstArgs);
    console.log('[process-pointcloud] viz_inst.py duration (ms):', Date.now() - runStart);
    if (result.stdout) {
      console.log('[process-pointcloud] viz_inst.py stdout:\n' + result.stdout);
    }
    if (result.stderr) {
      console.warn('[process-pointcloud] viz_inst.py stderr:\n' + result.stderr);
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
      instancedPath = await findLatestCombinedOutput(outputsDir, startTime);
    }

    if (!instancedPath) {
      res.status(500).json({
        success: false,
        error: 'Missing all_instances_combined.ply after viz_inst.py processing',
      });
      return;
    }

    console.log('[process-pointcloud] Instanced output:', instancedPath);
    console.log('[process-pointcloud] Total request duration (ms):', Date.now() - startTime);

    const instancedUrl = `/outputs/${path.relative(outputsDir, instancedPath).split(path.sep).join('/')}`;

    res.json({
      success: true,
      message: 'Point cloud processed successfully via viz_inst.py pipeline',
      outputUrl: instancedUrl,
      instancedUrl,
      outputFile: instancedPath
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

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
