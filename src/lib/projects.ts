import type { User } from '@supabase/supabase-js';
import { SUPABASE_STORAGE_BUCKET, supabase } from './supabase';

export interface Project {
  id: string;
  title: string;
  date: string;
  image: string;
  roomName: string;
  country: string;
  buildingType: string;
  createdAt: string;
  pointCloudRawUrl?: string;
  pointCloudSemanticUrl?: string;
  pointCloudInstancedUrl?: string;
  bimModelUrl?: string;
  bimIfcUrl?: string;
  bimPropsUrl?: string;
  storageBasePath?: string;
}

export interface GeneratedFile {
  relativePath: string;
  size: number;
  url: string;
}

export interface ProcessPointCloudResult {
  success: boolean;
  message?: string;
  semanticUrl?: string;
  instancedUrl?: string;
  bimIfcUrl?: string;
  bimObjUrl?: string;
  bimPropsUrl?: string;
  semanticRelativePath?: string;
  instancedRelativePath?: string;
  bimIfcRelativePath?: string;
  bimObjRelativePath?: string;
  bimPropsRelativePath?: string;
  generatedFiles?: GeneratedFile[];
}

interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  room_name: string;
  country: string;
  building_type: string;
  raw_file_path: string | null;
  semantic_file_path: string | null;
  instanced_file_path: string | null;
  bim_obj_file_path: string | null;
  bim_ifc_file_path: string | null;
  bim_props_file_path: string | null;
  image_url: string | null;
  created_at: string;
}

export interface CreateProjectInput {
  title: string;
  roomName: string;
  country: string;
  buildingType: string;
  uploadedFile: File;
  processResult: ProcessPointCloudResult;
  user: User;
}

const normalizePath = (value: string) => value.replace(/\\/g, '/');

const getPublicAssetUrl = (storagePath?: string | null) => {
  if (!storagePath) {
    return undefined;
  }

  const { data } = supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return data.publicUrl;
};

const formatProjectDate = (createdAt: string) =>
  new Date(createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const mapProjectRow = (row: ProjectRow): Project => ({
  id: row.id,
  title: row.title,
  date: formatProjectDate(row.created_at),
  image: row.image_url || '',
  roomName: row.room_name,
  country: row.country,
  buildingType: row.building_type,
  createdAt: row.created_at,
  pointCloudRawUrl: getPublicAssetUrl(row.raw_file_path),
  pointCloudSemanticUrl: getPublicAssetUrl(row.semantic_file_path),
  pointCloudInstancedUrl: getPublicAssetUrl(row.instanced_file_path),
  bimModelUrl: getPublicAssetUrl(row.bim_obj_file_path),
  bimIfcUrl: getPublicAssetUrl(row.bim_ifc_file_path),
  bimPropsUrl: getPublicAssetUrl(row.bim_props_file_path),
  storageBasePath: `${row.user_id}/${row.id}`,
});

const fetchBlob = async (assetUrl: string) => {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated asset: ${assetUrl}`);
  }
  return response.blob();
};

const uploadBlobToStorage = async (
  storagePath: string,
  fileBody: File | Blob,
  contentType?: string,
) => {
  const { error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, fileBody, {
      upsert: true,
      contentType,
    });

  if (error) {
    throw error;
  }
};

const removeStoragePaths = async (paths: string[]) => {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (uniquePaths.length === 0) {
    return;
  }

  const { error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .remove(uniquePaths);

  if (error) {
    throw error;
  }
};

export const listProjects = async (userId: string) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data as ProjectRow[]).map(mapProjectRow);
};

export const createProject = async ({
  title,
  roomName,
  country,
  buildingType,
  uploadedFile,
  processResult,
  user,
}: CreateProjectInput) => {
  const projectId = crypto.randomUUID();
  const basePath = `${user.id}/${projectId}`;
  const rawStoragePath = normalizePath(`${basePath}/raw/${uploadedFile.name}`);

  await uploadBlobToStorage(rawStoragePath, uploadedFile, uploadedFile.type || 'application/octet-stream');

  const uploadedPaths = new Map<string, string>();

  for (const generatedFile of processResult.generatedFiles || []) {
    const relativePath = normalizePath(generatedFile.relativePath);
    const storagePath = normalizePath(`${basePath}/outputs/${relativePath}`);
    const blob = await fetchBlob(generatedFile.url);

    await uploadBlobToStorage(storagePath, blob, blob.type || 'application/octet-stream');
    uploadedPaths.set(relativePath, storagePath);
  }

  const semanticPath = processResult.semanticRelativePath
    ? uploadedPaths.get(normalizePath(processResult.semanticRelativePath)) || null
    : null;
  const instancedPath = processResult.instancedRelativePath
    ? uploadedPaths.get(normalizePath(processResult.instancedRelativePath)) || null
    : null;
  const bimObjPath = processResult.bimObjRelativePath
    ? uploadedPaths.get(normalizePath(processResult.bimObjRelativePath)) || null
    : null;
  const bimIfcPath = processResult.bimIfcRelativePath
    ? uploadedPaths.get(normalizePath(processResult.bimIfcRelativePath)) || null
    : null;
  const bimPropsPath = processResult.bimPropsRelativePath
    ? uploadedPaths.get(normalizePath(processResult.bimPropsRelativePath)) || null
    : null;

  const insertPayload = {
    id: projectId,
    user_id: user.id,
    title,
    room_name: roomName,
    country,
    building_type: buildingType,
    raw_file_path: rawStoragePath,
    semantic_file_path: semanticPath,
    instanced_file_path: instancedPath,
    bim_obj_file_path: bimObjPath,
    bim_ifc_file_path: bimIfcPath,
    bim_props_file_path: bimPropsPath,
    image_url: null,
  };

  const { data, error } = await supabase
    .from('projects')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapProjectRow(data as ProjectRow);
};

<<<<<<< HEAD
export const deleteProject = async (project: Project) => {
  const storageBasePath = project.storageBasePath;

  if (storageBasePath) {
    const { data: objects, error: listError } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .list(storageBasePath, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (listError) {
      throw listError;
    }

    const pathsToDelete = (objects || []).flatMap((entry) => {
      const nestedPath = `${storageBasePath}/${entry.name}`;
      if (!entry.id) {
        return [];
      }
      return [nestedPath];
    });

    const queue = [...pathsToDelete];
    while (queue.length > 0) {
      const currentPrefix = queue.shift()!;
      const { data: nestedEntries, error: nestedListError } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .list(currentPrefix, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (nestedListError) {
        throw nestedListError;
      }

      if (!nestedEntries?.length) {
        continue;
      }

      for (const nestedEntry of nestedEntries) {
        const nestedPath = `${currentPrefix}/${nestedEntry.name}`;
        if (nestedEntry.id) {
          pathsToDelete.push(nestedPath);
        } else {
          queue.push(nestedPath);
        }
      }
    }

    if (pathsToDelete.length > 0) {
      const { error: removeStorageError } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .remove(pathsToDelete);

      if (removeStorageError) {
        throw removeStorageError;
      }
    }
  }

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', project.id);
=======
export const deleteProject = async (projectId: string, userId: string) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
>>>>>>> origin/main

  if (error) {
    throw error;
  }
<<<<<<< HEAD
=======

  const row = data as ProjectRow;
  await removeStoragePaths([
    row.raw_file_path || '',
    row.semantic_file_path || '',
    row.instanced_file_path || '',
    row.bim_obj_file_path || '',
    row.bim_ifc_file_path || '',
    row.bim_props_file_path || '',
  ]);

  const { error: deleteError } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (deleteError) {
    throw deleteError;
  }
>>>>>>> origin/main
};
