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

const runPython = (inputPath) => {
  return new Promise((resolve, reject) => {
    const pythonExec = process.env.PYTHON_EXEC || 'python';
    const scriptPath = process.env.PYTHON_SCRIPT || path.join(__dirname, 'process_pointcloud.py');
    const checkpointPath = process.env.PYTHON_CHECKPOINT || 'C:\\Users\\iamsa\\Downloads\\scan2bim\\val_best.pth';

    const args = [
      scriptPath,
      '--input_file',
      inputPath,
      '--output_dir',
      outputsDir,
      '--checkpoint',
      checkpointPath
    ];

    if (process.env.PYTHON_CPU === '1') {
      args.push('--cpu');
    }

    const child = spawn(pythonExec, args, { stdio: ['ignore', 'pipe', 'pipe'] });

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

  try {
    const { stdout, stderr } = await runPython(inputPath);
    if (stdout) {
      console.log('[process-pointcloud] Python stdout:\n' + stdout);
    }
    if (stderr) {
      console.warn('[process-pointcloud] Python stderr:\n' + stderr);
    }
    const outputPath = await findLatestOutput(inputPath, startTime);

    if (!outputPath) {
      console.warn('[process-pointcloud] No output PLY found for input:', inputPath);
      res.status(500).json({
        success: false,
        error: 'No output PLY file found after processing',
        pythonOutput: stdout || stderr
      });
      return;
    }
    console.log('[process-pointcloud] Using output file:', outputPath);

    const outputBuffer = await fs.readFile(outputPath);
    const outputBase64 = outputBuffer.toString('base64');

    res.json({
      success: true,
      message: 'Point cloud processed successfully',
      output: outputBase64,
      outputFile: outputPath,
      pythonOutput: stdout
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
