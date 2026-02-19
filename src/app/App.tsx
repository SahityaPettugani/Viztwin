import { useState, useRef } from 'react';
import DesktopHomePage from '../imports/DesktopHomePage';
import DesktopProjectLibrary from '../imports/DesktopProjectLibrary';
import DesktopGetStarted from '../imports/DesktopGetStarted';
import OverlayUploadPage from '../imports/OverlayUploadPage';
import OverlayFilePropertiesPopUp from '../imports/OverlayFilePropertiesPopUp';
import OverlayUploadingPage from '../imports/OverlayUploadingPage';
import OverlayUploadedPage from '../imports/OverlayUploadedPage';

const base64ToBlobUrl = (base64Data: string, mimeType = 'application/octet-stream') => {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
};

interface Project {
  id: string;
  title: string;
  date: string;
  image: string;
  pointCloudRawUrl?: string;
  pointCloudSemanticUrl?: string;
  pointCloudInstancedUrl?: string;
  bimModelUrl?: string;
  bimIfcUrl?: string;
  bimPropsUrl?: string;
  pointCloudFile?: File;
}

interface FormData {
  projectName: string;
  roomName: string;
  country: string;
  buildingType: string;
}

export default function App() {
  const [overlayState, setOverlayState] = useState<'none' | 'upload' | 'properties' | 'uploading' | 'uploaded'>('none');
  const [currentPage, setCurrentPage] = useState<'home' | 'library' | 'get-started'>('home');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [uploadError, setUploadError] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    projectName: '',
    roomName: '',
    country: '',
    buildingType: ''
  });
  
  // Ref to store abort controller for cancelling uploads
  const uploadAbortController = useRef<AbortController | null>(null);
  
  // Processing state
  const [processingStage, setProcessingStage] = useState<'uploading' | 'processing' | 'complete'>('uploading');

  const handleOpenUpload = () => {
    setOverlayState('upload');
  };

  const handleCloseOverlay = () => {
    setOverlayState('none');
    setUploadProgress(0);
    setUploadedFileName('');
    setUploadedFile(null);
    setUploadError('');
    setFormData({
      projectName: '',
      roomName: '',
      country: '',
      buildingType: ''
    });
  };

  const handleFileSelect = (file: File) => {
    setUploadedFile(file);
    setUploadedFileName(file.name);
  };

  const handleShowProperties = () => {
    setOverlayState('properties');
  };

  const handleStartUpload = async () => {
    // Validate that we have a file
    if (!uploadedFile) {
      alert('Error: No file selected. Please select a .ply file.');
      return;
    }
    
    // Validate that all form fields are filled
    if (!formData.projectName || !formData.roomName || !formData.country || !formData.buildingType) {
      alert('Error: Please fill in all required fields (Project Name, Room Name, Country, and Building Type).');
      return;
    }
    
    console.log('Starting upload process...');
    console.log('File:', uploadedFile.name, uploadedFile.size, 'bytes');
    console.log('Form data:', formData);
    
    // Go directly to uploading state
    setOverlayState('uploading');
    setProcessingStage('uploading');
    setUploadProgress(0);
    
    // Create new AbortController for this upload
    uploadAbortController.current = new AbortController();
    
    try {
        const originalUrl = URL.createObjectURL(uploadedFile);

        setUploadProgress(15);

        // Step 1: Process the point cloud with Python (via Node backend)
        console.log('Step 1: Processing point cloud with Python backend...');
        setProcessingStage('processing');

        const processFormData = new FormData();
        processFormData.append('file', uploadedFile);

        const processResponse = await fetch('/api/process-pointcloud', {
          method: 'POST',
          body: processFormData,
          signal: uploadAbortController.current.signal
        });

        console.log('Process response status:', processResponse.status);

        let semanticUrl: string | undefined;
        let instancedUrl: string | undefined;
        let bimModelUrl: string | undefined;
        let bimIfcUrl: string | undefined;
        let bimPropsUrl: string | undefined;

        if (processResponse.ok) {
          const processResult = await processResponse.json();
          console.log('Process result:', processResult);
          if (processResult.semanticUrl) {
            semanticUrl = processResult.semanticUrl;
          } else if (processResult.semanticOutput) {
            semanticUrl = base64ToBlobUrl(processResult.semanticOutput);
          }

          if (processResult.instancedUrl || processResult.outputUrl) {
            instancedUrl = processResult.instancedUrl || processResult.outputUrl;
          } else if (processResult.output) {
            instancedUrl = base64ToBlobUrl(processResult.output);
          }

          bimModelUrl = processResult.bimObjUrl;
          bimIfcUrl = processResult.bimIfcUrl;
          bimPropsUrl = processResult.bimPropsUrl;
        } else {
          const errorData = await processResponse.json().catch(() => ({}));
          console.warn('Processing failed, continuing with original file:', errorData);
        }

        if (!semanticUrl && instancedUrl) {
          semanticUrl = instancedUrl;
        }
        if (semanticUrl && instancedUrl && semanticUrl === instancedUrl) {
          instancedUrl = undefined;
        }

        setUploadProgress(85);
        setProcessingStage('complete');

        // Step 2: Save project data locally
        const newProject: Project = {
          id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
          title: formData.projectName,
          date: new Date().toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          }),
          image: '',
          pointCloudRawUrl: originalUrl,
          pointCloudSemanticUrl: semanticUrl,
          pointCloudInstancedUrl: instancedUrl,
          bimModelUrl,
          bimIfcUrl,
          bimPropsUrl,
          pointCloudFile: undefined
        };

        console.log('Adding new project to state:', newProject);
        setUploadProgress(100);
        setProjects(prev => [newProject, ...prev]);
      
      // Show uploaded state after a short delay
      setTimeout(() => {
        setOverlayState('uploaded');
      }, 500);

    } catch (error) {
      // Check if the error is due to abort
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Upload cancelled by user');
        return; // Don't show error alert for user-initiated cancellation
      }
      
      console.error('Upload error:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOverlayState('properties'); // Go back to properties form
      setUploadProgress(0);
    } finally {
      uploadAbortController.current = null;
    }
  };

  const handleCancelUpload = () => {
    // Abort the upload
    if (uploadAbortController.current) {
      uploadAbortController.current.abort();
      uploadAbortController.current = null;
    }
    
    // Reset state and close overlay
    setUploadProgress(0);
    setOverlayState('properties'); // Go back to properties form
  };

  const handleNavigateToLibrary = () => {
    setCurrentPage('library');
    setOverlayState('none');
    setUploadProgress(0);
    setUploadedFileName('');
    setUploadedFile(null);
  };

  const handleNavigateToHome = () => {
    setCurrentPage('home');
  };

  const handleNavigateToGetStarted = () => {
    setCurrentPage('get-started');
  };

  return (
    <>
      {currentPage === 'home' && (
        <DesktopHomePage 
          onNavigateHome={handleNavigateToHome}
          onNavigateGetStarted={handleNavigateToGetStarted}
          onNavigateLibrary={handleNavigateToLibrary}
          onOpenUpload={handleOpenUpload}
        />
      )}
      
      {currentPage === 'library' && (
        <DesktopProjectLibrary 
          onNavigateHome={handleNavigateToHome}
          onNavigateGetStarted={handleNavigateToGetStarted}
          onNavigateLibrary={handleNavigateToLibrary}
          onOpenUpload={handleOpenUpload}
          projects={projects}
        />
      )}
      
      {currentPage === 'get-started' && (
        <DesktopGetStarted 
          onNavigateHome={handleNavigateToHome}
          onNavigateGetStarted={handleNavigateToGetStarted}
          onNavigateLibrary={handleNavigateToLibrary}
          onOpenUpload={handleOpenUpload}
        />
      )}
      
      {/* Overlay Modals */}
      {overlayState !== 'none' && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" onClick={handleCloseOverlay}>
          {overlayState === 'upload' && (
            <div className="relative scale-50" style={{ width: '571px', height: '682px' }} onClick={(e) => e.stopPropagation()}>
              <OverlayUploadPage onUploadClick={handleShowProperties} onFileSelect={handleFileSelect} />
            </div>
          )}
          {overlayState === 'properties' && (
            <div className="relative scale-50" style={{ width: '955px', height: '680px' }} onClick={(e) => e.stopPropagation()}>
              <OverlayFilePropertiesPopUp 
                formData={formData}
                onChange={setFormData}
                onUpload={handleStartUpload}
                onCancel={handleCancelUpload}
              />
              <div className="absolute left-[850px] top-[45px] w-[50px] h-[50px] cursor-pointer z-10" onClick={handleCloseOverlay} />
            </div>
          )}
          {overlayState === 'uploading' && (
            <div className="relative scale-50" style={{ width: '469px', height: '800px' }} onClick={(e) => e.stopPropagation()}>
              <OverlayUploadingPage progress={uploadProgress} fileName={uploadedFileName} onCancel={handleCancelUpload} stage={processingStage} />
            </div>
          )}
          {overlayState === 'uploaded' && (
            <div className="relative scale-50" style={{ width: '469px', height: '800px' }} onClick={(e) => e.stopPropagation()}>
              <OverlayUploadedPage onClose={handleNavigateToLibrary} fileName={uploadedFileName} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
