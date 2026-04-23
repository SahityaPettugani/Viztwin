import svgPaths from "./svg-i5o0bgtwbw";
import { useRef } from 'react';

const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_UPLOAD_SIZE_LABEL = '2 GB';

function UploadIcon({ onClick }: { onClick: () => void }) {
  return (
    <div className="absolute inset-[21.82%_67.68%_27.53%_20.9%]" data-name="upload icon">
      <div className="absolute inset-[-4.15%]">
        <svg className="block size-full cursor-pointer" fill="none" preserveAspectRatio="none" viewBox="0 0 30.1707 30.1707" onClick={onClick}>
          <g id="upload icon">
            <path d={svgPaths.p3727400} id="Vector" stroke="var(--stroke-0, black)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.31353" />
            <path d={svgPaths.p60bdb80} id="Vector_2" stroke="var(--stroke-0, black)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.31353" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function UploadButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[55px] left-[calc(50%-0.5px)] top-[calc(50%+186.5px)] w-[244px]" data-name="upload button">
      <div className="absolute bg-[#91f9d0] h-[55px] left-0 rounded-[27.5px] top-0 w-[244px] cursor-pointer hover:opacity-90 transition-opacity" onClick={onClick} />
      <p className="-translate-x-1/2 absolute font-['Satoshi_Variable:Bold',sans-serif] leading-[normal] left-[139px] not-italic text-[24px] text-black text-center top-[11px] tracking-[1.2px] cursor-pointer" onClick={onClick}>UPLOAD</p>
      <div>
        <UploadIcon onClick={onClick} />
      </div>
    </div>
  );
}

function Group() {
  return (
    <div className="absolute inset-[3.57%_10.71%]" data-name="Group">
      <div className="absolute inset-[-3.15%_-3.72%]">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 130 152">
          <g id="Group">
            <path d={svgPaths.pc0bf580} id="Vector" stroke="var(--stroke-0, #B3B3B3)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="9" />
            <path d="M37.4999 48.5H59.4999" id="Vector_2" stroke="var(--stroke-0, #B3B3B3)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="9" />
            <path d="M37.4999 81.5H92.4999" id="Vector_3" stroke="var(--stroke-0, #B3B3B3)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="9" />
            <path d="M37.4999 114.5H92.4999" id="Vector_4" stroke="var(--stroke-0, #B3B3B3)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="9" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function InterfaceFileTextTextCommonFile() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.5px)] overflow-clip size-[154px] top-[calc(50%-77px)]" data-name="Interface-file-text--text-common-file">
      <Group />
    </div>
  );
}

function Group1() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute contents left-1/2 top-[calc(50%-28.5px)]">
      <p className="-translate-x-1/2 absolute font-['Satoshi_Variable:Medium',sans-serif] leading-[normal] left-[285.5px] not-italic text-[32px] text-black text-center top-[362px] w-[571px] whitespace-pre-wrap">Upload or drag and drop a file.</p>
      <p className="-translate-x-1/2 absolute font-['Satoshi_Variable:Regular',sans-serif] leading-[normal] left-[285.5px] not-italic text-[24px] text-black text-center top-[406px] w-[457px] whitespace-pre-wrap">{`File format : PLY, Max ${MAX_UPLOAD_SIZE_LABEL}`}</p>
      <InterfaceFileTextTextCommonFile />
    </div>
  );
}

export default function OverlayUploadPage({ onUploadClick, onFileSelect }: { onUploadClick?: () => void; onFileSelect?: (file: File) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file extension
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.ply')) {
        alert('Error: Please upload a .ply file only.');
        // Reset the input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        alert(`Error: File exceeds the ${MAX_UPLOAD_SIZE_LABEL} upload limit.`);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      // File is valid, pass it to parent
      onFileSelect?.(file);
      onUploadClick?.();
    }
  };

  return (
    <div className="relative size-full" data-name="Overlay - Upload Page">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute bg-[rgba(255,255,255,0.8)] h-[682px] left-1/2 rounded-[20px] top-1/2 w-[571px]">
        <div aria-hidden="true" className="absolute border-2 border-[#b3b3b3] border-dashed inset-[-1px] pointer-events-none rounded-[21px]" />
      </div>
      <UploadButton onClick={handleUploadClick} />
      <Group1 />
      <input
        ref={fileInputRef}
        type="file"
        accept=".ply"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
