import svgPaths from "./svg-rcwvowy8h1";
import imgGettingStartedFigmaUploadFile1 from "../assets/f3348ba2de0d3625d425453aeed785097e6f5d4d.png";
import imgGettingStartedFigmaViewport1 from "../assets/43407705aa4918c3d0c4564153dd1ebb3906eb72.png";
import imgGettingStartedFigmaProjectLibrary1 from "../assets/8575603186d57c42735a7c4da8606bc764953bb0.png";
import imgCopyrightIcon2 from "../assets/16e1bbfe324f3bf8aa03b5647d8551c395b4c348.png";
import imgAsset71 from "../assets/3db3dc2413d49c7a1fa95643e1d9c8ec44b99844.png";
import imgVtLogoBigTop from "../assets/73a2f32f7019198ed482514e10b99691f65a78a1.png";

function Upload() {
  return (
    <div className="absolute h-[449px] left-[82px] top-[720px] w-[542px]" data-name="UPLOAD">
      <div className="absolute bg-[#e8e9eb] h-[449px] left-0 rounded-[25px] top-0 w-[542px]" />
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium','Noto_Sans:Italic',sans-serif] leading-[0] left-[37px] text-[#000001] text-[48px] top-[28px] w-[359px] whitespace-pre-wrap" style={{ fontVariationSettings: "'CTGR' 0, 'wdth' 100, 'wght' 400" }}>
        <span className="leading-[normal]">{`Upload point cloud file `}</span>
        <span className="font-['Aeonik_Extended_TRIAL:Medium_Italic','Noto_Sans:Italic',sans-serif] italic leading-[normal]" style={{ fontVariationSettings: "'CTGR' 0, 'wdth' 100, 'wght' 400" }}>
          (ply.)
        </span>
      </p>
      <div className="absolute h-[263px] left-[37px] top-[158px] w-[467px]" data-name="getting started figma upload file 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgGettingStartedFigmaUploadFile1} />
      </div>
    </div>
  );
}

function Viewport() {
  return (
    <div className="absolute h-[449px] left-[688px] top-[720px] w-[542px]" data-name="VIEWPORT">
      <div className="absolute bg-[#e8e9eb] h-[449px] left-0 rounded-[25px] top-0 w-[542px]" />
      <p className="absolute font-['Satoshi_Variable:Medium',sans-serif] font-medium leading-[normal] left-[216px] text-[#787878] text-[18px] top-[86px] w-[196px] whitespace-pre-wrap">Navigate layers, Check geometry properties</p>
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[normal] left-[38px] not-italic text-[#000001] text-[48px] top-[28px] w-[385px] whitespace-pre-wrap">{`Explore your model `}</p>
      <div className="absolute h-[263px] left-[38px] top-[158px] w-[467px]" data-name="getting started figma viewport 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgGettingStartedFigmaViewport1} />
      </div>
    </div>
  );
}

function ProjectLibrary() {
  return (
    <div className="absolute bg-[#918d8d] h-[449px] left-[1294px] top-[720px] w-[542px]" data-name="PROJECT LIBRARY">
      <div className="absolute bg-[#e8e9eb] h-[449px] left-0 rounded-[25px] top-0 w-[542px]" />
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[normal] left-[38px] not-italic text-[#000001] text-[48px] top-[28px] w-[407px] whitespace-pre-wrap">Browse projects in project library</p>
      <div className="absolute h-[263px] left-[38px] top-[158px] w-[467px]" data-name="getting started figma project library 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgGettingStartedFigmaProjectLibrary1} />
      </div>
    </div>
  );
}

function Plus() {
  return (
    <div className="relative shrink-0 size-[25px]" data-name="Plus">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 25 25">
        <g id="Plus">
          <path d={svgPaths.pd42b180} id="Icon" stroke="var(--stroke-0, #1E1E1E)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        </g>
      </svg>
    </div>
  );
}

function NewProjButton() {
  return (
    <div className="-translate-x-1/2 absolute bg-[#91f9d0] content-stretch flex gap-[10px] h-[55px] items-center justify-center left-[calc(50%+197px)] px-[38px] py-[11px] rounded-[27.5px] top-[1284px] w-[330px]" data-name="New proj button">
      <Plus />
      <p className="font-['Satoshi_Variable:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#000001] text-[24px] text-center">NEW PROJECT</p>
    </div>
  );
}

function SupportButton() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[1716px] p-[10px] top-[3px]" data-name="Support button">
      <p className="font-['Satoshi_Variable:Regular',sans-serif] font-normal leading-[normal] relative shrink-0 text-[14px] text-black text-center">Support</p>
    </div>
  );
}

function HomeButton() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[473px] p-[10px] top-[72px]" data-name="Home button">
      <p className="font-['Satoshi_Variable:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#000001] text-[28px] text-center">Home</p>
    </div>
  );
}

function LibraryButton() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[595px] p-[10px] top-[72px]" data-name="Library button">
      <p className="font-['Satoshi_Variable:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#000001] text-[28px] text-center">Library</p>
    </div>
  );
}

function GetStartedButton() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[282px] p-[10px] top-[72px]" data-name="Get started button">
      <p className="font-['Satoshi_Variable:Black',sans-serif] font-black leading-[normal] relative shrink-0 text-[#000001] text-[28px] text-center">Get Started</p>
    </div>
  );
}

function AboutUsButton() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[729px] p-[10px] top-[72px]" data-name="About us button">
      <p className="font-['Satoshi_Variable:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#000001] text-[28px] text-center">About Us</p>
    </div>
  );
}

function InterfaceSettingCogWorkLoadingCogGearSettingsMachine() {
  return <div className="absolute left-[1793px] size-[32.389px] top-[99px]" data-name="interface-setting-cog--work-loading-cog-gear-settings-machine" />;
}

function TheStandardizedHeader() {
  return (
    <div className="absolute inset-0 overflow-clip" data-name="THE standardized header">
      <div className="absolute bg-white h-[110px] left-[31px] top-[45px] w-[1921px]" />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute bg-[#d3f4ea] h-[45px] left-[calc(50%+8px)] top-[calc(50%-62px)] w-[1921px]" />
      <SupportButton />
      <p className="-translate-x-1/2 absolute font-['Satoshi_Variable:Regular',sans-serif] font-normal leading-[normal] left-[1832.5px] text-[14px] text-black text-center top-[13px]">VizTwin</p>
      <div className="absolute left-[1859px] size-[10px] top-[18px]" data-name="copyright icon 2">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgCopyrightIcon2} />
      </div>
      <div className="absolute flex h-[34px] items-center justify-center left-[1793px] top-[5px] w-0" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "21" } as React.CSSProperties}>
        <div className="flex-none rotate-90">
          <div className="h-0 relative w-[34px]">
            <div className="absolute inset-[-1px_0_0_0]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 34 1">
                <line id="Line 5" stroke="var(--stroke-0, #B3B3B3)" x2="34" y1="0.5" y2="0.5" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <HomeButton />
      <LibraryButton />
      <GetStartedButton />
      <AboutUsButton />
      <InterfaceSettingCogWorkLoadingCogGearSettingsMachine />
      <div className="absolute h-[76px] left-[114px] top-[63px] w-[142px]" data-name="Asset 7 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgAsset71} />
      </div>
      <div className="absolute h-0 left-[31px] top-[155px] w-[1921px]">
        <div className="absolute inset-[-1px_0]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1921 2">
            <path d="M0 1H1921" id="Vector 6" stroke="var(--stroke-0, #B3B3B3)" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function AccountButton() {
  return (
    <div className="absolute left-[1819px] size-[50px] top-[76px]" data-name="Account button">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 50 50">
        <g id="Account button">
          <circle cx="25" cy="25" fill="var(--fill-0, #E8E9EB)" id="Ellipse 4" r="25" />
          <g id="human icon">
            <path d={svgPaths.p17ff5900} id="Vector" stroke="var(--stroke-0, #000001)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
            <path d={svgPaths.p201afc00} id="Vector_2" stroke="var(--stroke-0, #000001)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function StandardizedHeaderS() {
  return (
    <div className="absolute h-[169px] left-[-31px] top-0 w-[1967px]" data-name="Standardized headerS">
      <TheStandardizedHeader />
      <AccountButton />
    </div>
  );
}

export default function DesktopGetStarted() {
  return (
    <div className="bg-white relative size-full" data-name="Desktop -Get Started">
      <div className="absolute h-[1173px] left-[-51px] top-[231px] w-[2192px]" data-name="VT logo big top">
        <div className="absolute inset-0 opacity-10 overflow-hidden pointer-events-none">
          <img alt="" className="absolute h-[99.75%] left-0 max-w-none top-0 w-full" src={imgVtLogoBigTop} />
        </div>
      </div>
      <Upload />
      <Viewport />
      <ProjectLibrary />
      <p className="absolute font-['Aeonik_Extended_TRIAL:Bold',sans-serif] leading-[normal] left-[82px] not-italic text-[#000001] text-[96px] top-[204px] w-[859px] whitespace-pre-wrap">Getting Started with VizTwin</p>
      <p className="absolute font-['Aeonik_Extended_TRIAL:Bold',sans-serif] leading-[normal] left-[82px] not-italic text-[#000001] text-[96px] top-[1256px] w-[859px] whitespace-pre-wrap">Get Started Now</p>
      <p className="absolute font-['Satoshi_Variable:Regular',sans-serif] font-normal leading-[normal] left-[82px] text-[24px] text-black top-[589px] w-[525px] whitespace-pre-wrap">Seamlessly supports all common point-cloud formats, without requiring high-precision scans.</p>
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium','Noto_Sans:Medium',sans-serif] leading-[normal] left-[82px] text-[#000001] text-[48px] top-[461px] w-[1077px] whitespace-pre-wrap" style={{ fontVariationSettings: "'CTGR' 0, 'wdth' 100, 'wght' 500" }}>
        Start scanning with any low-cost scanner or a phone application like Polycam!
      </p>
      <NewProjButton />
      <StandardizedHeaderS />
    </div>
  );
}