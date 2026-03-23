import svgPaths from "./svg-1pmfq9k36w";
import imgVtLogoBig from "../assets/73a2f32f7019198ed482514e10b99691f65a78a1.png";
import imgHomepageFigmaComparision1 from "../assets/d450788c64c43761ca9d5b9c22f92a9e79db98e3.png";
import imgHomepageFigmaCamera1 from "../assets/c17258cea165bff6fcbe560aa8eb784bb300de07.png";
import imgHomepageFigmaViewpoert1 from "../assets/d1f75b4d681dd8c0a2c372c28c579a2c670d6b59.png";
import { StandardizedHeaderS, Plus } from './SharedHeader';
import bgVideo from "../assets/BGVID.mp4";

function NewProjButton({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} className="absolute bg-[#91f9d0] flex gap-[0.5vw] items-center justify-center left-1/2 -translate-x-1/2 px-[2vw] py-[0.6vw] rounded-[27.5px] top-[32vw] hover:bg-[#7ee6bc] transition-colors cursor-pointer" data-name="New proj button">
      <Plus />
      <p className="font-['Satoshi_Variable:Medium',sans-serif] leading-[normal] not-italic text-[#000001] text-[1.25vw] text-center whitespace-nowrap">NEW PROJECT</p>
    </div>
  );
}

export default function DesktopHomePage({ 
  onNavigateHome, 
  onNavigateGetStarted, 
  onNavigateLibrary,
  onOpenUpload,
  authButtonLabel,
  onAuthButtonClick,
}: {
  onNavigateHome: () => void;
  onNavigateGetStarted: () => void;
  onNavigateLibrary: () => void;
  onOpenUpload: () => void;
  authButtonLabel?: string;
  onAuthButtonClick?: () => void;
}) {
  return (
    <div className="bg-white relative w-full min-h-screen overflow-x-hidden" data-name="Desktop - Home Page">
      {/* Spacing for fixed header */}
      <div className="h-[8.8vw]" />
      
      {/* Background VT logo */}
      <div className="absolute left-[5.6%] top-[16.5vw] w-[114%] h-[60.94vw] pointer-events-none">
        <div className="rotate-180 w-full h-full">
          <div className="w-full h-full" data-name="VT logo big">
            <img alt="" className="absolute inset-0 max-w-none object-cover opacity-10 pointer-events-none size-full" src={imgVtLogoBig} />
          </div>
        </div>
      </div>
      
      {/* Hero Section Background */}
      <div className="absolute bg-[#e8e9eb] h-[41.93vw] left-0 top-[8.12vw] w-full" />
      
      {/* Point Cloud Image */}
      <div className="absolute h-[41.25vw] left-[23.9%] top-[8.8vw] w-[52.19%]" data-name="TURNTABLE POINT CLOUD 1">
        <div className="absolute inset-0 opacity-50 overflow-hidden pointer-events-none">
          <video
            className="absolute w-full h-full object-cover"
            src={bgVideo}
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
      </div>
      
      {/* VizTwin Title */}
      <p className="absolute font-['Aeonik_Extended_TRIAL',sans-serif] leading-[normal] left-1/2 -translate-x-1/2 not-italic text-[#000001] text-[10.2vw] text-center top-[18vw]">VizTwin</p>
      
      {/* Tagline */}
      <p className="absolute font-['Satoshi_Variable:Regular',sans-serif] leading-[1.4] left-1/2 -translate-x-1/2 not-italic text-[1vw] text-black text-center top-[29vw] w-[37.76%] whitespace-nowrap">Convert your point cloud scans into classified BIM interiors with ease.</p>
      
      {/* CTA Button */}
      <NewProjButton onClick={onOpenUpload} />
      
      {/* Feature 1: Smart Geometry */}
      <div className="absolute h-[49.32vw] left-[4.27%] rounded-[25px] shadow-[5px_3px_13.5px_-5px_rgba(0,0,0,0.25)] top-[53.13vw] w-[36.98%]" data-name="homepage figma comparision 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[25px] size-full" src={imgHomepageFigmaComparision1} />
      </div>
      
      <p className="absolute font-['Satoshi_Variable:Bold',sans-serif] leading-[1.33] left-[4.27%] not-italic text-[#787878] text-[0.94vw] top-[113.75vw] w-[25.73%]">Our pipeline detects interior components with precision, giving you structured BIM data without manual modeling.</p>
      
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[1.17] left-[4.27%] not-italic text-[#000001] text-[2.5vw] top-[103.8vw] w-[37.19%]">Smart Geometry Reconstruction, Clean Classification.</p>
      
      {/* Feature 2: No Setup */}
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[1.17] left-[67.92%] not-italic text-[#000001] text-[2.5vw] top-[77.34vw] w-[29.22%]">No Setup, No Plugins.</p>
      
      <p className="absolute font-['Satoshi_Variable:Medium',sans-serif] leading-[1.33] left-[67.92%] not-italic text-[#787878] text-[0.94vw] top-[81.46vw] w-[27.55%]">With our cloud pipeline handling the heavy lifting, everything runs in your browser - no plugins needed!</p>
      
      <div className="absolute h-[18.96vw] left-[61.72%] rounded-[26px] shadow-[2px_2px_13.5px_-5px_rgba(0,0,0,0.25)] top-[57.03vw] w-[33.75%]" data-name="homepage figma viewpoert 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[26px] size-full" src={imgHomepageFigmaViewpoert1} />
      </div>
      
      {/* Feature 3: Scan with any camera */}
      <div className="absolute h-[34.32vw] left-[43.7%] rounded-[26px] top-[81.67vw] w-[19.58%]" data-name="homepage figma camera 1">
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[26px]">
          <img alt="" className="absolute w-full h-full object-cover" src={imgHomepageFigmaCamera1} />
        </div>
      </div>
      
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[1.17] left-[64.79%] not-italic text-[#000001] text-[2.5vw] top-[105.21vw] w-[17.71%]">Scan with any camera.</p>
      
      <p className="absolute font-['Satoshi_Variable:Bold',sans-serif] leading-[1.33] left-[64.79%] not-italic text-[#787878] text-[0.94vw] top-[112.24vw] w-[17.71%]">No expensive hardware required - Works seamlessly with scans captured on any device you already own.</p>
      
      {/* Header */}
      <StandardizedHeaderS 
        onNavigateHome={onNavigateHome}
        onNavigateGetStarted={onNavigateGetStarted}
        onNavigateLibrary={onNavigateLibrary}
        activePage="home"
        authButtonLabel={authButtonLabel}
        onAuthButtonClick={onAuthButtonClick}
      />
      
      {/* Bottom spacing */}
      <div className="h-[25vw]" />
    </div>
  );
}
