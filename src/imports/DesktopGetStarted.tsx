import svgPaths from "./svg-b0gd95j40g";
import imgGettingStartedFigmaUploadFile1 from "../assets/f3348ba2de0d3625d425453aeed785097e6f5d4d.png";
import imgGettingStartedFigmaViewport1 from "../assets/43407705aa4918c3d0c4564153dd1ebb3906eb72.png";
import imgGettingStartedFigmaProjectLibrary1 from "../assets/8575603186d57c42735a7c4da8606bc764953bb0.png";
import imgVtLogoBigTop from "../assets/73a2f32f7019198ed482514e10b99691f65a78a1.png";
import { StandardizedHeaderS, Plus } from './SharedHeader';

function Upload() {
  return (
    <div className="absolute h-[23.4vw] left-[4.27vw] top-[29.5vw] w-[28.23vw]" data-name="UPLOAD">
      <div className="absolute bg-[#e8e9eb] h-[23.4vw] left-0 rounded-[1.3vw] top-0 w-[28.23vw]" />
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[0] left-[1.93vw] not-italic text-[#000001] text-[2.5vw] top-[1.46vw] w-[18.7vw] whitespace-pre-wrap">
        <span className="leading-[normal]">{`Upload point cloud file `}</span>
        <span className="font-['Aeonik_Extended_TRIAL:Medium_Italic',sans-serif] leading-[normal]">(ply.)</span>
      </p>
      <div className="absolute h-[13.7vw] left-[1.93vw] top-[8.23vw] w-[24.32vw]" data-name="getting started figma upload file 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgGettingStartedFigmaUploadFile1} />
      </div>
    </div>
  );
}

function Viewport() {
  return (
    <div className="absolute h-[23.4vw] left-[35.83vw] top-[29.5vw] w-[28.23vw]" data-name="VIEWPORT">
      <div className="absolute bg-[#e8e9eb] h-[23.4vw] left-0 rounded-[1.3vw] top-0 w-[28.23vw]" />
      <p className="absolute font-['Satoshi_Variable:Medium',sans-serif] leading-[normal] left-[11.25vw] not-italic text-[#787878] text-[0.94vw] top-[4.48vw] w-[10.21vw] whitespace-pre-wrap">Navigate layers, Check geometry properties</p>
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[normal] left-[1.98vw] not-italic text-[#000001] text-[2.5vw] top-[1.46vw] w-[20.05vw] whitespace-pre-wrap">{`Explore your model `}</p>
      <div className="absolute h-[13.7vw] left-[1.98vw] top-[8.23vw] w-[24.32vw]" data-name="getting started figma viewport 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgGettingStartedFigmaViewport1} />
      </div>
    </div>
  );
}

function ProjectLibrary() {
  return (
    <div className="absolute bg-[#918d8d] h-[23.4vw] left-[67.4vw] top-[29.5vw] w-[28.23vw]" data-name="PROJECT LIBRARY">
      <div className="absolute bg-[#e8e9eb] h-[23.4vw] left-0 rounded-[1.3vw] top-0 w-[28.23vw]" />
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[normal] left-[1.98vw] not-italic text-[#000001] text-[2.5vw] top-[1.46vw] w-[21.2vw] whitespace-pre-wrap">Browse projects in project library</p>
      <div className="absolute h-[13.7vw] left-[1.98vw] top-[8.23vw] w-[24.32vw]" data-name="getting started figma project library 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgGettingStartedFigmaProjectLibrary1} />
      </div>
    </div>
  );
}

function NewProjButton({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} className="absolute bg-[#91f9d0] content-stretch flex gap-[0.52vw] h-[2.86vw] items-center justify-center left-[50.5vw] px-[1.98vw] py-[0.57vw] rounded-[1.43vw] top-[57vw] w-[17.19vw] cursor-pointer hover:bg-[#7ee6bc] transition-colors" data-name="New proj button">
      <Plus />
      <p className="font-['Satoshi_Variable:Medium',sans-serif] leading-[normal] not-italic relative shrink-0 text-[#000001] text-[1.25vw] text-center">NEW PROJECT</p>
    </div>
  );
}

export default function DesktopGetStarted({
  onNavigateHome,
  onNavigateGetStarted,
  onNavigateLibrary,
  onOpenUpload
}: {
  onNavigateHome: () => void;
  onNavigateGetStarted: () => void;
  onNavigateLibrary: () => void;
  onOpenUpload: () => void;
}) {
  return (
    <div className="bg-white relative w-full min-h-screen overflow-x-hidden" data-name="Desktop -Get Started">
      {/* Header spacing */}
      <div className="h-[8.8vw]" />
      
      {/* Content container */}
      <div className="relative w-full">
        <div className="absolute h-[61.1vw] left-[-2.66vw] top-[-4vw] w-[114.17vw] opacity-10 overflow-hidden pointer-events-none" data-name="VT logo big top">
          <img alt="" className="w-full h-auto object-contain" src={imgVtLogoBigTop} />
        </div>
        <Upload />
        <Viewport />
        <ProjectLibrary />
        <p className="absolute font-['Aeonik_Extended_TRIAL:Bold',sans-serif] leading-[normal] left-[4.27vw] not-italic text-[#000001] text-[5vw] top-[2.63vw] w-[44.74vw] whitespace-pre-wrap">Getting Started with VizTwin</p>
        <p className="absolute font-['Aeonik_Extended_TRIAL:Bold',sans-serif] leading-[normal] left-[4.27vw] not-italic text-[#000001] text-[5vw] top-[54.9vw] w-[44.74vw] whitespace-pre-wrap">Get Started Now</p>
        <p className="absolute font-['Satoshi_Variable:Regular',sans-serif] leading-[normal] left-[4.27vw] not-italic text-[1.25vw] text-black top-[22.68vw] w-[27.34vw] whitespace-pre-wrap">Seamlessly supports all common point-cloud formats, without requiring high-precision scans.</p>
        <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[normal] left-[4.27vw] not-italic text-[#000001] text-[2.5vw] top-[16.01vw] w-[56.09vw] whitespace-pre-wrap">Start scanning with any low-cost scanner or a phone application like Polycam!</p>
        <NewProjButton onClick={onOpenUpload} />
      </div>
      
      {/* Use shared header */}
      <StandardizedHeaderS 
        onNavigateHome={onNavigateHome}
        onNavigateGetStarted={onNavigateGetStarted}
        onNavigateLibrary={onNavigateLibrary}
        activePage="get-started"
      />
      
      {/* Bottom spacing */}
      <div className="h-[10vw]" />
    </div>
  );
}