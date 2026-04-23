import { useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import DesktopHomePage from '../imports/DesktopHomePage';
import DesktopProjectLibrary from '../imports/DesktopProjectLibrary';
import DesktopGetStarted from '../imports/DesktopGetStarted';
import OverlayUploadPage from '../imports/OverlayUploadPage';
import OverlayFilePropertiesPopUp from '../imports/OverlayFilePropertiesPopUp';
import OverlayUploadingPage from '../imports/OverlayUploadingPage';
import OverlayUploadedPage from '../imports/OverlayUploadedPage';
import AuthScreen from './components/AuthScreen';
import {
  createProject,
  deleteProject,
  listProjects,
  type ProcessPointCloudResult,
  type Project,
} from '../lib/projects';
import { absolutizeUrl, toApiUrl } from '../lib/api';
import { supabase, supabaseConfigError } from '../lib/supabase';

interface ProjectFormData {
  projectName: string;
  roomName: string;
  country: string;
  buildingType: string;
}

const emptyFormData: ProjectFormData = {
  projectName: '',
  roomName: '',
  country: '',
  buildingType: '',
};
const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_UPLOAD_SIZE_LABEL = '2 GB';

const normalizeProcessResultUrls = (processResult: ProcessPointCloudResult): ProcessPointCloudResult => ({
  ...processResult,
  semanticUrl: absolutizeUrl(processResult.semanticUrl),
  instancedUrl: absolutizeUrl(processResult.instancedUrl),
  bimIfcUrl: absolutizeUrl(processResult.bimIfcUrl),
  bimObjUrl: absolutizeUrl(processResult.bimObjUrl),
  bimPropsUrl: absolutizeUrl(processResult.bimPropsUrl),
  generatedFiles: processResult.generatedFiles?.map((file) => ({
    ...file,
    url: absolutizeUrl(file.url) || file.url,
  })),
});

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [overlayState, setOverlayState] = useState<'none' | 'upload' | 'properties' | 'uploading' | 'uploaded'>('none');
  const [currentPage, setCurrentPage] = useState<'home' | 'library' | 'get-started'>('home');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [formData, setFormData] = useState<ProjectFormData>(emptyFormData);
  const [processingStage, setProcessingStage] = useState<'uploading' | 'processing' | 'complete'>('uploading');
  const uploadAbortController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    const bootstrapSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Failed to restore session:', error);
      }
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    };

    bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadProjects = async () => {
      if (!user) {
        setProjects([]);
        return;
      }

      setProjectsLoading(true);
      try {
        const savedProjects = await listProjects(user.id);
        setProjects(savedProjects);
      } catch (error) {
        console.error('Failed to load projects:', error);
        alert(`Failed to load saved projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setProjectsLoading(false);
      }
    };

    loadProjects();
  }, [user]);

  const resetUploadState = () => {
    setUploadProgress(0);
    setUploadedFileName('');
    setUploadedFile(null);
    setUploadError('');
    setFormData(emptyFormData);
  };

  const handleOpenUpload = () => {
    setOverlayState('upload');
  };

  const handleCloseOverlay = () => {
    setOverlayState('none');
    resetUploadState();
  };

  const handleFileSelect = (file: File) => {
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      alert(`Error: File exceeds the ${MAX_UPLOAD_SIZE_LABEL} upload limit.`);
      return;
    }

    setUploadedFile(file);
    setUploadedFileName(file.name);
  };

  const handleShowProperties = () => {
    setOverlayState('properties');
  };

  const handleStartUpload = async () => {
    if (!user) {
      alert('Please log in before uploading a project.');
      return;
    }

    if (!uploadedFile) {
      alert('Error: No file selected. Please select a .ply file.');
      return;
    }

    if (uploadedFile.size > MAX_UPLOAD_SIZE_BYTES) {
      alert(`Error: File exceeds the ${MAX_UPLOAD_SIZE_LABEL} upload limit.`);
      return;
    }

    if (!formData.projectName || !formData.roomName || !formData.country || !formData.buildingType) {
      alert('Error: Please fill in all required fields (Project Name, Room Name, Country, and Building Type).');
      return;
    }

    setOverlayState('uploading');
    setProcessingStage('uploading');
    setUploadProgress(0);
    setUploadError('');
    uploadAbortController.current = new AbortController();

    try {
      setUploadProgress(15);
      setProcessingStage('processing');

      const processFormData = new FormData();
      processFormData.append('file', uploadedFile);

      const processResponse = await fetch(toApiUrl('/api/process-pointcloud'), {
        method: 'POST',
        body: processFormData,
        signal: uploadAbortController.current.signal,
      });

      let processResult: ProcessPointCloudResult = { success: false };
      if (processResponse.ok) {
        processResult = normalizeProcessResultUrls((await processResponse.json()) as ProcessPointCloudResult);
      } else {
        const errorData = await processResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Point cloud processing failed.');
      }

      setUploadProgress(75);

      const savedProject = await createProject({
        title: formData.projectName,
        roomName: formData.roomName,
        country: formData.country,
        buildingType: formData.buildingType,
        uploadedFile,
        processResult,
        user,
      });

      setProcessingStage('complete');
      setUploadProgress(100);
      setProjects((prev) => [savedProject, ...prev]);

      setTimeout(() => {
        setOverlayState('uploaded');
      }, 500);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Upload cancelled by user');
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Upload error:', error);
      setUploadError(message);
      alert(`Upload failed: ${message}`);
      setOverlayState('properties');
      setUploadProgress(0);
    } finally {
      uploadAbortController.current = null;
    }
  };

  const handleCancelUpload = () => {
    if (uploadAbortController.current) {
      uploadAbortController.current.abort();
      uploadAbortController.current = null;
    }

    setUploadProgress(0);
    setOverlayState('properties');
  };

  const handleNavigateToLibrary = () => {
    setCurrentPage('library');
    setOverlayState('none');
    resetUploadState();
  };

  const handleNavigateToHome = () => {
    setCurrentPage('home');
  };

  const handleNavigateToGetStarted = () => {
    setCurrentPage('get-started');
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(`Failed to sign out: ${error.message}`);
      return;
    }

    setProjects([]);
    setCurrentPage('home');
    setOverlayState('none');
    resetUploadState();
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!user) {
      alert('Please log in before deleting a project.');
      return;
    }

    setDeletingProjectId(projectId);
    try {
      await deleteProject(projectId, user.id);
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      setDeletingProjectId((current) => (current === projectId ? null : current));
    }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f5]">
        <p className="font-['Satoshi_Variable:Medium',sans-serif] text-lg text-[#333333]">
          Loading VizTwin...
        </p>
      </div>
    );
  }

  if (supabaseConfigError || !supabase) {
    return <AuthScreen />;
  }

  if (!session || !user) {
    return <AuthScreen />;
  }

  const authButtonLabel = 'Sign out';

  return (
    <>
      {currentPage === 'home' && (
        <DesktopHomePage
          onNavigateHome={handleNavigateToHome}
          onNavigateGetStarted={handleNavigateToGetStarted}
          onNavigateLibrary={handleNavigateToLibrary}
          onOpenUpload={handleOpenUpload}
          authButtonLabel={authButtonLabel}
          onAuthButtonClick={handleSignOut}
        />
      )}

      {currentPage === 'library' && (
        <DesktopProjectLibrary
          onNavigateHome={handleNavigateToHome}
          onNavigateGetStarted={handleNavigateToGetStarted}
          onNavigateLibrary={handleNavigateToLibrary}
          onOpenUpload={handleOpenUpload}
          projects={projects}
          deletingProjectId={deletingProjectId}
          onDeleteProject={handleDeleteProject}
          authButtonLabel={authButtonLabel}
          onAuthButtonClick={handleSignOut}
        />
      )}

      {currentPage === 'get-started' && (
        <DesktopGetStarted
          onNavigateHome={handleNavigateToHome}
          onNavigateGetStarted={handleNavigateToGetStarted}
          onNavigateLibrary={handleNavigateToLibrary}
          onOpenUpload={handleOpenUpload}
          authButtonLabel={authButtonLabel}
          onAuthButtonClick={handleSignOut}
        />
      )}

      {projectsLoading && currentPage === 'library' ? (
        <div className="fixed bottom-6 right-6 z-[80] rounded-full bg-[#000001] px-5 py-3 font-['Satoshi_Variable:Medium',sans-serif] text-sm text-white shadow-lg">
          Loading saved projects...
        </div>
      ) : null}

      {deletingProjectId && currentPage === 'library' ? (
        <div className="fixed bottom-6 right-6 z-[80] rounded-full bg-[#000001] px-5 py-3 font-['Satoshi_Variable:Medium',sans-serif] text-sm text-white shadow-lg">
          Deleting project...
        </div>
      ) : null}

      {overlayState !== 'none' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={handleCloseOverlay}>
          {overlayState === 'upload' && (
            <div className="relative scale-70" style={{ width: '571px', height: '682px' }} onClick={(event) => event.stopPropagation()}>
              <OverlayUploadPage onUploadClick={handleShowProperties} onFileSelect={handleFileSelect} />
            </div>
          )}
          {overlayState === 'properties' && (
            <div className="relative scale-70" style={{ width: '955px', height: '680px' }} onClick={(event) => event.stopPropagation()}>
              <OverlayFilePropertiesPopUp
                formData={formData}
                onChange={setFormData}
                onUpload={handleStartUpload}
                onCancel={handleCancelUpload}
              />
              <div className="absolute left-[850px] top-[45px] h-[50px] w-[50px] cursor-pointer z-10" onClick={handleCloseOverlay} />
              {uploadError ? (
                <div className="absolute bottom-[35px] left-[55px] max-w-[845px] rounded-[10px] bg-[#fff1f1] px-4 py-3 font-['Satoshi_Variable:Medium',sans-serif] text-[14px] text-[#b42318]">
                  {uploadError}
                </div>
              ) : null}
            </div>
          )}
          {overlayState === 'uploading' && (
            <div className="relative scale-70" style={{ width: '469px', height: '800px' }} onClick={(event) => event.stopPropagation()}>
              <OverlayUploadingPage progress={uploadProgress} fileName={uploadedFileName} onCancel={handleCancelUpload} stage={processingStage} />
            </div>
          )}
          {overlayState === 'uploaded' && (
            <div className="relative scale-70" style={{ width: '469px', height: '800px' }} onClick={(event) => event.stopPropagation()}>
              <OverlayUploadedPage onClose={handleNavigateToLibrary} fileName={uploadedFileName} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
