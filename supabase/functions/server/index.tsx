import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Bucket name for point cloud files
const BUCKET_NAME = 'make-1d0df597-pointclouds';

// Python API configuration
const PYTHON_API_URL = Deno.env.get('PYTHON_API_URL') || 'http://localhost:8000';

// Create bucket on startup (with await to ensure it completes)
async function initializeStorage() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    if (!bucketExists) {
      const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false
      });
      if (error) {
        console.error('Failed to create bucket:', error);
      } else {
        console.log(`Created storage bucket: ${BUCKET_NAME}`);
      }
    } else {
      console.log(`Storage bucket ${BUCKET_NAME} already exists`);
    }
  } catch (error) {
    console.error('Error initializing storage:', error);
  }
}

// Helper function to ensure bucket exists
async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
  
  if (!bucketExists) {
    console.log('Bucket not found, creating it now...');
    const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false
    });
    if (error) {
      console.error('Failed to create bucket:', error);
      throw new Error(`Failed to create bucket: ${error.message}`);
    }
    console.log(`Created storage bucket: ${BUCKET_NAME}`);
  }
  return true;
}

// Initialize storage on startup
initializeStorage();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-1d0df597/health", (c) => {
  return c.json({ status: "ok" });
});

// Upload point cloud file endpoint
app.post("/make-server-1d0df597/upload-pointcloud", async (c) => {
  try {
    // Ensure bucket exists before uploading
    await ensureBucketExists();
    
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.ply')) {
      return c.json({ error: 'Only .ply files are allowed' }, 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.name}`;
    
    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, uint8Array, {
        contentType: 'application/octet-stream',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error while uploading point cloud file:', uploadError);
      return c.json({ error: 'Failed to upload file', details: uploadError.message }, 500);
    }

    // Create signed URL (valid for 1 year)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(fileName, 31536000); // 1 year in seconds

    if (signedUrlError) {
      console.error('Signed URL error while creating URL for point cloud:', signedUrlError);
      return c.json({ error: 'Failed to create signed URL', details: signedUrlError.message }, 500);
    }

    return c.json({
      success: true,
      fileName: fileName,
      signedUrl: signedUrlData.signedUrl
    });
  } catch (error) {
    console.error('Error in upload-pointcloud endpoint:', error);
    return c.json({ error: 'Internal server error', details: String(error) }, 500);
  }
});

// Save project data endpoint
app.post("/make-server-1d0df597/projects", async (c) => {
  try {
    const body = await c.req.json();
    const { 
      projectName, 
      roomName, 
      country, 
      buildingType, 
      pointCloudFileName,
      pointCloudUrl
    } = body;

    // Validate required fields
    if (!projectName || !roomName || !country || !buildingType) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Create project object
    const project = {
      id: Date.now().toString(),
      title: projectName,
      date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }),
      projectName,
      roomName,
      country,
      buildingType,
      pointCloudFileName,
      pointCloudUrl,
      createdAt: new Date().toISOString()
    };

    // Save to key-value store
    await kv.set(`project:${project.id}`, project);

    return c.json({
      success: true,
      project
    });
  } catch (error) {
    console.error('Error saving project data:', error);
    return c.json({ error: 'Internal server error', details: String(error) }, 500);
  }
});

// Get all projects endpoint
app.get("/make-server-1d0df597/projects", async (c) => {
  try {
    // Get all projects from key-value store
    const projects = await kv.getByPrefix('project:');
    
    // Sort by creation date (newest first)
    const sortedProjects = projects.sort((a: any, b: any) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return c.json({
      success: true,
      projects: sortedProjects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return c.json({ error: 'Internal server error', details: String(error) }, 500);
  }
});

// Delete project endpoint
app.delete("/make-server-1d0df597/projects/:id", async (c) => {
  try {
    const projectId = c.req.param('id');
    
    // Get project to find point cloud file
    const project = await kv.get(`project:${projectId}`);
    
    if (project && project.pointCloudFileName) {
      // Delete file from storage
      const { error: deleteError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([project.pointCloudFileName]);
      
      if (deleteError) {
        console.error('Error deleting point cloud file from storage:', deleteError);
      }
    }

    // Delete project from key-value store
    await kv.del(`project:${projectId}`);

    return c.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    return c.json({ error: 'Internal server error', details: String(error) }, 500);
  }
});

// Process point cloud with Python API endpoint
app.post("/make-server-1d0df597/process-pointcloud", async (c) => {
  try {
    console.log('Starting point cloud processing...');
    
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.ply')) {
      return c.json({ error: 'Only .ply files are allowed' }, 400);
    }

    console.log(`Processing file: ${file.name}, size: ${file.size} bytes`);

    // Forward file to Python API
    const pythonFormData = new FormData();
    pythonFormData.append('file', file);

    console.log(`Forwarding to Python API: ${PYTHON_API_URL}/process-simple`);
    
    const pythonResponse = await fetch(`${PYTHON_API_URL}/process-simple`, {
      method: 'POST',
      body: pythonFormData
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      console.error(`Python API error: ${pythonResponse.status} - ${errorText}`);
      return c.json({ 
        error: 'Processing failed', 
        details: `Python API returned status ${pythonResponse.status}`,
        message: errorText 
      }, 500);
    }

    console.log('Python API processing successful');

    // Get the processed PLY file
    const processedBlob = await pythonResponse.blob();
    
    // Get summary from headers
    const summaryHeader = pythonResponse.headers.get('X-Processing-Summary');
    const summary = summaryHeader ? JSON.parse(summaryHeader) : null;

    console.log('Processing summary:', summary);

    // Upload processed file to Supabase Storage
    await ensureBucketExists();
    
    const timestamp = Date.now();
    const processedFileName = `processed-${timestamp}-${file.name}`;
    
    const arrayBuffer = await processedBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(processedFileName, uint8Array, {
        contentType: 'application/octet-stream',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error while saving processed point cloud:', uploadError);
      return c.json({ error: 'Failed to save processed file', details: uploadError.message }, 500);
    }

    // Create signed URL (valid for 1 year)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(processedFileName, 31536000);

    if (signedUrlError) {
      console.error('Signed URL error for processed point cloud:', signedUrlError);
      return c.json({ error: 'Failed to create signed URL', details: signedUrlError.message }, 500);
    }

    console.log('Processed file uploaded successfully');

    return c.json({
      success: true,
      fileName: processedFileName,
      signedUrl: signedUrlData.signedUrl,
      summary: summary
    });

  } catch (error) {
    console.error('Error in process-pointcloud endpoint:', error);
    
    // Check if it's a connection error to Python API
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isConnectionError = errorMessage.includes('Connection refused') || errorMessage.includes('connect');
    
    if (isConnectionError) {
      console.warn('Python API is not available - this is expected if the Python service is not running');
      console.warn('The system will continue using the original point cloud file without processing');
    }
    
    return c.json({ 
      error: 'Internal server error', 
      details: String(error),
      message: errorMessage,
      isPythonApiUnavailable: isConnectionError
    }, 500);
  }
});

// Check Python API health endpoint
app.get("/make-server-1d0df597/python-api-status", async (c) => {
  try {
    const response = await fetch(`${PYTHON_API_URL}/`);
    const data = await response.json();
    return c.json({
      success: true,
      pythonApi: data,
      url: PYTHON_API_URL
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Cannot connect to Python API',
      url: PYTHON_API_URL,
      details: String(error)
    }, 503);
  }
});

Deno.serve(app.fetch);