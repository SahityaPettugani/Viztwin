import svgPaths from "./svg-1pmfq9k36w";
import imgCopyrightIcon2 from "../assets/16e1bbfe324f3bf8aa03b5647d8551c395b4c348.png";
import imgAsset71 from "../assets/3db3dc2413d49c7a1fa95643e1d9c8ec44b99844.png";

export function Plus() {
  return (
    <div className="relative shrink-0 w-[1.5vw] h-[1.5vw] min-w-[20px] min-h-[20px]" data-name="Plus">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 25 25">
        <g id="Plus">
          <path d={svgPaths.pd42b180} id="Icon" stroke="var(--stroke-0, #1E1E1E)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        </g>
      </svg>
    </div>
  );
}

function SupportButton() {
  return (
    <div className="absolute flex items-center justify-center right-[8.7%] top-[0.68vw] cursor-pointer hover:opacity-70 transition-opacity" data-name="Support button">
      <p className="font-['Satoshi_Variable:Regular',sans-serif] leading-[normal] not-italic text-[0.73vw] text-black text-center">Support</p>
    </div>
  );
}

function HomeButton({ onClick, isActive }: { onClick: () => void; isActive?: boolean }) {
  return (
    <div onClick={onClick} className="absolute flex items-center justify-center left-[24.6%] p-[0.5vw] top-[3.8vw] cursor-pointer hover:opacity-70 transition-opacity" data-name="Home button">
      <p className={`font-['Satoshi_Variable:${isActive ? 'Black' : 'Medium'}',sans-serif] leading-[normal] not-italic text-[#000001] text-[1.46vw] text-center`}>Home</p>
    </div>
  );
}

function LibraryButton({ onClick, isActive }: { onClick: () => void; isActive?: boolean }) {
  return (
    <div onClick={onClick} className="absolute flex items-center justify-center left-[31%] p-[0.5vw] top-[3.8vw] cursor-pointer hover:opacity-70 transition-opacity" data-name="Library button">
      <p className={`font-['Satoshi_Variable:${isActive ? 'Black' : 'Medium'}',sans-serif] leading-[normal] not-italic text-[#000001] text-[1.46vw] text-center`}>Library</p>
    </div>
  );
}

function GetStartedButton({ onClick, isActive }: { onClick: () => void; isActive?: boolean }) {
  return (
    <div onClick={onClick} className="absolute flex items-center justify-center left-[14.7%] p-[0.5vw] top-[3.8vw] cursor-pointer hover:opacity-70 transition-opacity" data-name="Get started button">
      <p className={`font-['Satoshi_Variable:${isActive ? 'Black' : 'Medium'}',sans-serif] leading-[normal] not-italic text-[#000001] text-[1.46vw] text-center`}>Get Started</p>
    </div>
  );
}

function AboutUsButton() {
  return (
    <div className="absolute flex items-center justify-center left-[38%] p-[0.5vw] top-[3.8vw] cursor-pointer hover:opacity-70 transition-opacity" data-name="About us button">
      <p className="font-['Satoshi_Variable:Medium',sans-serif] leading-[normal] not-italic text-[#000001] text-[1.46vw] text-center">About Us</p>
    </div>
  );
}

function InterfaceSettingCogWorkLoadingCogGearSettingsMachine() {
  return <div className="absolute right-[6.7%] w-[1.69vw] h-[1.69vw] top-[5.2vw]" data-name="interface-setting-cog--work-loading-cog-gear-settings-machine" />;
}

function TheStandardizedHeader({ 
  onNavigateHome, 
  onNavigateGetStarted, 
  onNavigateLibrary, 
  activePage 
}: {
  onNavigateHome: () => void;
  onNavigateGetStarted: () => void;
  onNavigateLibrary: () => void;
  activePage: 'home' | 'library' | 'get-started';
}) {
  return (
    <div className="absolute inset-0 overflow-clip" data-name="THE standardized header">
      <div className="absolute bg-white h-[5.73vw] left-[1.6%] top-[2.34vw] w-full right-0" />
      <div className="absolute bg-[#d3f4ea] h-[2.34vw] left-0 right-0 top-0 w-full" />
      <SupportButton />
      <p className="absolute font-['Satoshi_Variable:Regular',sans-serif] leading-[normal] right-[4.2%] not-italic text-[0.73vw] text-black text-center top-[0.68vw]">VizTwin</p>
      <div className="absolute right-[3.2%] w-[0.52vw] h-[0.52vw] top-[0.94vw]" data-name="copyright icon 2">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgCopyrightIcon2} />
      </div>
      <div className="absolute flex h-[1.77vw] items-center justify-center right-[7.35%] top-[0.26vw] w-0">
        <div className="flex-none rotate-90">
          <div className="h-0 relative w-[1.77vw]">
            <div className="absolute inset-[-1px_0_0_0]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 34 1">
                <line id="Line 5" stroke="var(--stroke-0, #B3B3B3)" x2="34" y1="0.5" y2="0.5" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <HomeButton onClick={onNavigateHome} isActive={activePage === 'home'} />
      <LibraryButton onClick={onNavigateLibrary} isActive={activePage === 'library'} />
      <GetStartedButton onClick={onNavigateGetStarted} isActive={activePage === 'get-started'} />
      <AboutUsButton />
      <InterfaceSettingCogWorkLoadingCogGearSettingsMachine />
      <div className="absolute h-[3.96vw] left-[5.94%] top-[3.28vw] w-[7.4vw]" data-name="Asset 7 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover cursor-pointer size-full hover:opacity-80 transition-opacity" src={imgAsset71} onClick={onNavigateHome} />
      </div>
      <div className="absolute h-0 left-0 right-0 top-[8.07vw] w-full">
        <div className="absolute inset-[-1px_0]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1921 2">
            <path d="M0 1H1921" id="Vector 6" stroke="var(--stroke-0, #B3B3B3)" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Frame({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 overflow-clip">
      <div className="absolute bg-[#e8e9eb] h-full left-1/2 -translate-x-1/2 rounded-[27.5px] top-0 w-[88.1%]" />
      <p className="absolute font-['Satoshi_Variable:Medium',sans-serif] leading-[normal] left-1/2 -translate-x-1/2 not-italic text-[#1e1e1e] text-[1.05vw] text-center top-[22%] whitespace-nowrap">{label}</p>
    </div>
  );
}

function LogInNSignUpButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <div className="absolute h-[2.6vw] right-[0.5%] top-[3.96vw] w-[13.13vw] cursor-pointer hover:opacity-80 transition-opacity" data-name="log in n sign up button" onClick={onClick}>
      <Frame label={label} />
    </div>
  );
}

export function StandardizedHeaderS({ 
  onNavigateHome, 
  onNavigateGetStarted, 
  onNavigateLibrary, 
  activePage,
  authButtonLabel = 'Log in / Sign up',
  onAuthButtonClick,
}: {
  onNavigateHome: () => void;
  onNavigateGetStarted: () => void;
  onNavigateLibrary: () => void;
  activePage: 'home' | 'library' | 'get-started';
  authButtonLabel?: string;
  onAuthButtonClick?: () => void;
}) {
  return (
    <div className="fixed h-[8.8vw] left-0 top-0 w-full z-50" data-name="Standardized headerS">
      <TheStandardizedHeader 
        onNavigateHome={onNavigateHome}
        onNavigateGetStarted={onNavigateGetStarted}
        onNavigateLibrary={onNavigateLibrary}
        activePage={activePage}
      />
      <LogInNSignUpButton label={authButtonLabel} onClick={onAuthButtonClick} />
    </div>
  );
}
