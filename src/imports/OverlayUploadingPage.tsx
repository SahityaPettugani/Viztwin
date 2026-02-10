import svgPaths from "./svg-zw6danqs03";
import imgPlyFileIcon3 from "../assets/ac7aca74147728bfac8c576e84a722cc09d86dcd.png";
import imgPauseIcon2 from "../assets/898cfcbc849282df2a24dc2052e4fafe79ea09f5.png";
import imgPlusIcon2 from "../assets/a21c69b03379f5ecf59e94b0a074d1caa8d122af.png";

function UploadedPlyFile({ fileName }: { fileName: string }) {
  return (
    <div className="absolute contents left-[28px] top-[586px]" data-name="uploaded ply file 1">
      <p className="absolute font-['Satoshi_Variable:Medium',sans-serif] font-medium leading-[0] left-[102px] text-[24px] text-black top-[604px]">
        <span className="leading-[normal]">{fileName || 'pointcloud_1.ply'}</span>
      </p>
      <div className="absolute left-[28px] size-[64px] top-[586px]" data-name="ply file icon 3">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgPlyFileIcon3} />
      </div>
    </div>
  );
}

function PauseButton() {
  return (
    <div className="absolute contents left-[346px] top-[603px]" data-name="pause button">
      <div className="absolute bg-white border border-black border-solid left-[346px] rounded-[4px] shadow-[1px_1px_10.6px_0px_rgba(0,0,0,0.25)] size-[31px] top-[603px]" />
      <div className="absolute left-[355px] size-[13px] top-[612px]" data-name="pause icon 2">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgPauseIcon2} />
      </div>
    </div>
  );
}

function CancelButton({ onCancel }: { onCancel?: () => void }) {
  return (
    <div className="absolute contents left-[394px] top-[603px]" data-name="cancel button">
      <div className="absolute bg-white border border-black border-solid left-[394px] rounded-[4px] shadow-[1px_1px_10.6px_0px_rgba(0,0,0,0.25)] size-[31px] top-[603px]" />
      <div 
        className="absolute flex items-center justify-center left-[399px] size-[21.213px] top-[608.39px] cursor-pointer hover:opacity-70 transition-opacity" 
        style={{ "--transform-inner-width": "1200", "--transform-inner-height": "21" } as React.CSSProperties}
        onClick={onCancel}
      >
        <div className="-rotate-45 flex-none">
          <div className="relative size-[15px]" data-name="plus icon 2">
            <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgPlusIcon2} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OverlayUploadingPage({ progress = 0, fileName = '', onCancel, stage = 'uploading' }: { progress?: number; fileName?: string; onCancel?: () => void; stage?: 'uploading' | 'processing' | 'complete' }) {
  // Determine stage based on progress or explicit stage prop
  const getStageText = () => {
    if (stage === 'uploading') return 'UPLOADING...';
    if (stage === 'processing') return 'PROCESSING...';
    if (stage === 'complete') return 'FINALIZING...';
    // Fallback to progress-based
    if (progress < 30) return 'UPLOADING...';
    if (progress < 80) return 'PROCESSING...';
    return 'FINALIZING...';
  };

  return (
    <div className="relative size-full" data-name="Overlay - Uploading Page">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute bg-white h-[561px] left-[calc(50%-0.5px)] rounded-tl-[20px] rounded-tr-[20px] top-[calc(50%-115.5px)] w-[469px]">
        <div aria-hidden="true" className="absolute border-2 border-[#b3b3b3] border-solid inset-[-1px] pointer-events-none rounded-tl-[21px] rounded-tr-[21px]" />
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[116px] items-center justify-center left-[calc(50%-1.5px)] top-[calc(50%+223px)] w-[469px]">
        <div className="flex-none rotate-180">
          <div className="bg-white h-[116px] relative rounded-tl-[20px] rounded-tr-[20px] w-[469px]">
            <div aria-hidden="true" className="absolute border-2 border-[#b3b3b3] border-solid inset-[-1px] pointer-events-none rounded-tl-[21px] rounded-tr-[21px]" />
          </div>
        </div>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[99px] items-center justify-center left-[calc(50%-1.5px)] top-[calc(50%+222.5px)] w-[453px]">
        <div className="flex-none rotate-180">
          <div className="bg-[#d3f4ea] h-[99px] rounded-[12px] w-[453px]" />
        </div>
      </div>
      <UploadedPlyFile fileName={fileName} />
      <div className="absolute left-[190px] size-[88px] top-[237px]">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 88 88">
          <circle cx="44" cy="44" id="Ellipse 6" r="40" stroke="var(--stroke-0, #E8E9EB)" strokeWidth="8" />
        </svg>
      </div>
      <div className="absolute left-[194px] size-[80px] top-[241px]">
        <div className="absolute inset-[-5%]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 88 88">
            <path 
              d={svgPaths.p26f16f40} 
              id="Ellipse 7" 
              stroke="var(--stroke-0, black)" 
              strokeWidth="8"
              style={{
                strokeDasharray: '251.2',
                strokeDashoffset: `${251.2 - (251.2 * progress) / 100}`,
                transition: 'stroke-dashoffset 0.1s linear'
              }}
            />
          </svg>
        </div>
      </div>
      <div 
        className="absolute bg-black h-[8px] left-px top-[553px] transition-all duration-100"
        style={{ width: `${(progress / 100) * 198}px` }}
      />
      <PauseButton />
      <CancelButton onCancel={onCancel} />
      <p className="absolute font-['Satoshi_Variable:Medium',sans-serif] font-medium leading-[0] left-[190px] text-[24px] text-black top-[575px]">
        <span className="leading-[normal]">{getStageText()}</span>
      </p>
    </div>
  );
}