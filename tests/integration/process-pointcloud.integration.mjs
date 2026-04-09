import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures');
const samplePlyPath = path.join(fixturesDir, 'sample-input.ply');
const invalidInputPath = path.join(fixturesDir, 'invalid-input.txt');

const createMultipartBody = async (filePath, fieldName = 'file') => {
  const form = new FormData();
  const data = await fs.readFile(filePath);
  form.append(fieldName, new Blob([data]), path.basename(filePath));
  return form;
};

const waitForServer = async (baseUrl) => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for test server to become ready');
};

const startServer = async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scan2bim-it-'));
  const uploadsDir = path.join(tempRoot, 'uploads');
  const outputsDir = path.join(tempRoot, 'outputs');
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });

  const port = 3300 + Math.floor(Math.random() * 300);
  const baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    ...process.env,
    PORT: String(port),
    UPLOADS_DIR: uploadsDir,
    OUTPUTS_DIR: outputsDir,
    MODAL_ENDPOINT_URL: '',
    TEST_STUB_PIPELINE: '1',
    ENABLE_BIM_PREVIEW: '1',
    PYTHON_EXEC: process.env.PYTHON_EXEC || 'python',
    PYTHON_CHECKPOINT: path.join(fixturesDir, 'unused-checkpoint.pth'),
    PYTHON_SCRIPT: path.join(fixturesDir, 'stub_vizainst.py'),
    PYTHON_JSON2IFC_SCRIPT: path.join(fixturesDir, 'stub_json2ifc.py'),
    PYTHON_IFC_EXPORTER_SCRIPT: path.join(fixturesDir, 'stub_ifc_exporter.py'),
  });

  const { startServer } = await import(`${pathToFileURL(path.join(repoRoot, 'server.js')).href}?it=${Date.now()}`);
  const server = await startServer();
  await waitForServer(baseUrl);

  return { baseUrl, server, tempRoot };
};

const stopServer = async (server) => {
  if (!server?.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const run = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

const main = async () => {
  const server = await startServer();
  let pipelineResult;

  try {
    await run('rejects uploads that are not .ply files', async () => {
      const body = await createMultipartBody(invalidInputPath);
      const response = await fetch(`${server.baseUrl}/api/process-pointcloud`, {
        method: 'POST',
        body,
      });

      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.success, false);
      assert.match(payload.error, /only \.ply uploads are supported/i);
    });

    await run('accepts .ply upload and returns stage artifacts', async () => {
      const body = await createMultipartBody(samplePlyPath);
      const response = await fetch(`${server.baseUrl}/api/process-pointcloud`, {
        method: 'POST',
        body,
      });

      assert.equal(response.status, 200);
      pipelineResult = await response.json();

      assert.equal(pipelineResult.success, true);
      assert.ok(pipelineResult.instancedUrl);
      assert.ok(pipelineResult.bimIfcUrl);
      assert.ok(pipelineResult.bimObjUrl);
      assert.ok(pipelineResult.bimPropsUrl);
      assert.ok(Array.isArray(pipelineResult.generatedFiles));

      const generatedPaths = new Set(
        pipelineResult.generatedFiles.map((file) => file.relativePath),
      );
      assert.ok(generatedPaths.has('all_instances_combined.ply'));
      assert.ok(generatedPaths.has('instantiation_summary.json'));
      assert.ok(generatedPaths.has('bim_reconstruction_data.json'));
      assert.ok(generatedPaths.has('bim_model.ifc'));
      assert.ok(generatedPaths.has('bim_model.obj'));
      assert.ok(generatedPaths.has('bim_model_properties.json'));
    });

    await run('processing stage emits BIM reconstruction JSON', async () => {
      assert.ok(pipelineResult);
      const jsonFile = pipelineResult.generatedFiles.find(
        (file) => file.relativePath === 'bim_reconstruction_data.json',
      );
      assert.ok(jsonFile);

      const response = await fetch(`${server.baseUrl}${jsonFile.url}`);
      assert.equal(response.status, 200);
      const data = await response.json();

      assert.ok(Array.isArray(data));
      assert.equal(data[0].type, 'wall');
      assert.equal(typeof data[0].geometry.start_x, 'number');
      assert.equal(typeof data[0].geometry.end_y, 'number');
    });

    await run('IFC conversion and export stage produce viewer/download files', async () => {
      assert.ok(pipelineResult);

      const ifcResponse = await fetch(`${server.baseUrl}${pipelineResult.bimIfcUrl}`);
      assert.equal(ifcResponse.status, 200);
      assert.match(await ifcResponse.text(), /ISO-10303-21/);

      const objResponse = await fetch(`${server.baseUrl}${pipelineResult.bimObjUrl}`);
      assert.equal(objResponse.status, 200);
      assert.match(await objResponse.text(), /^o bim_model/m);

      const propsResponse = await fetch(`${server.baseUrl}${pipelineResult.bimPropsUrl}`);
      assert.equal(propsResponse.status, 200);
      const props = await propsResponse.json();
      assert.deepEqual(props.elements[0], { id: 'wall_0', type: 'wall' });
    });

    console.log('All integration tests passed.');
  } finally {
    await stopServer(server.server);
    await fs.rm(server.tempRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
