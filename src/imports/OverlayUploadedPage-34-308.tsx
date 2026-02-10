import svgPaths from "./svg-cmkrvihyv0";
import imgPlyFileIcon3 from "../assets/ac7aca74147728bfac8c576e84a722cc09d86dcd.png";

function UploadedPlyFile() {
  return (
    <div className="absolute contents left-[28px] top-[586px]" data-name="uploaded ply file 1">
      <p className="absolute font-['Rubik:Regular',sans-serif] font-['Satoshi_Variable:Medium',sans-serif] font-medium font-normal leading-[0] left-[102px] text-[0px] text-[24px] text-black top-[604px]">
        <span className="leading-[normal]">pointcloud_1</span>
        <span className="leading-[normal]">.ply</span>
      </p>
      <div className="absolute left-[28px] size-[64px] top-[586px]" data-name="ply file icon 3">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgPlyFileIcon3} />
      </div>
    </div>
  );
}

function CheckButton() {
  return (
    <div className="absolute left-[395px] size-[31px] top-[605px]" data-name="check button">
      <div className="absolute inset-[-30.97%_-37.42%_-37.42%_-30.97%]">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 52.2 52.2">
          <g id="check button">
            <g filter="url(#filter0_d_33_242)" id="Rectangle 11">
              <rect fill="var(--fill-0, white)" height="31" rx="4" width="31" x="9.6" y="9.6" />
              <rect height="30" rx="3.5" stroke="var(--stroke-0, black)" width="30" x="10.1" y="10.1" />
            </g>
            <path d={svgPaths.p2c614000} id="Vector" stroke="var(--stroke-0, #000001)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.31353" />
          </g>
          <defs>
            <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="52.2" id="filter0_d_33_242" width="52.2" x="0" y="0">
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feColorMatrix in="SourceAlpha" result="hardAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
              <feOffset dx="1" dy="1" />
              <feGaussianBlur stdDeviation="5.3" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
              <feBlend in2="BackgroundImageFix" mode="normal" result="effect1_dropShadow_33_242" />
              <feBlend in="SourceGraphic" in2="effect1_dropShadow_33_242" mode="normal" result="shape" />
            </filter>
          </defs>
        </svg>
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
            <path d={svgPaths.pc0bf580} id="Vector" stroke="var(--stroke-0, black)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="9" />
            <path d="M37.4999 48.5H59.4999" id="Vector_2" stroke="var(--stroke-0, black)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="9" />
            <path d="M37.4999 81.5H92.4999" id="Vector_3" stroke="var(--stroke-0, black)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="9" />
            <path d="M37.4999 114.5H92.4999" id="Vector_4" stroke="var(--stroke-0, black)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="9" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function InterfaceFileTextTextCommonFile() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+6px)] overflow-clip size-[154px] top-[calc(50%-202px)]" data-name="Interface-file-text--text-common-file">
      <Group />
    </div>
  );
}

function UploadFileThing() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute contents left-[calc(50%+5.5px)] top-[calc(50%-132.5px)]" data-name="upload file thing">
      <p className="-translate-x-1/2 absolute font-['Satoshi_Variable:Bold',sans-serif] font-bold leading-[35px] left-[241px] text-[#000001] text-[36px] text-center top-[292px] w-[280px] whitespace-pre-wrap">Upload or drag and drop a file.</p>
      <p className="-translate-x-1/2 absolute font-['Satoshi_Variable:Regular',sans-serif] font-normal leading-[normal] left-[240px] text-[#000001] text-[24px] text-center top-[378px]">{`File format : PLY, Max ~GB `}</p>
      <InterfaceFileTextTextCommonFile />
    </div>
  );
}

function BackToLibraryButton() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[142px] p-[10px] top-[410px]" data-name="Back to Library button">
      <p className="font-['Satoshi_Variable:Regular',sans-serif] font-normal leading-[normal] relative shrink-0 text-[18px] text-black text-center">Back to Project Library</p>
    </div>
  );
}

export default function OverlayUploadedPage() {
  return (
    <div className="relative size-full" data-name="Overlay - Uploaded Page">
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
      <UploadedPlyFile />
      <div className="absolute bg-black h-[8px] left-px top-[553px] w-[469px]" />
      <CheckButton />
      <UploadFileThing />
      <BackToLibraryButton />
    </div>
  );
}