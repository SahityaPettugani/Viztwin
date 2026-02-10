import svgPaths from "./svg-us1vnbkcd4";

function X() {
  return (
    <div className="absolute left-[850px] size-[50px] top-[45px]" data-name="X">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 50 50">
        <g id="X">
          <path d={svgPaths.p3af37d20} id="Icon" stroke="var(--stroke-0, black)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        </g>
      </svg>
    </div>
  );
}

interface FormData {
  projectName: string;
  roomName: string;
  country: string;
  buildingType: string;
}

function ProjectNameInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="absolute contents left-[55px] top-[134px]" data-name="Project Name Input">
      <p className="absolute font-['Satoshi_Variable:Bold',sans-serif] leading-[0] left-[55px] not-italic text-[18px] text-black top-[134px] tracking-[1.8px] w-[152.344px] whitespace-pre-wrap">
        <span className="leading-[normal]">{`Project Name `}</span>
        <span className="leading-[normal] text-[#d90101]">*</span>
      </p>
      <div className="absolute border border-[rgba(179,179,179,0.75)] border-solid h-[50px] left-[55px] rounded-[5px] top-[170px] w-[408px]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute h-[50px] left-[55px] top-[170px] w-[408px] px-4 bg-transparent border-0 outline-none font-['Satoshi_Variable:Regular',sans-serif] text-[16px] text-black"
        placeholder="Enter project name"
      />
    </div>
  );
}

function RoomNameInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="absolute contents left-[55px] top-[358px]" data-name="Room Name Input">
      <p className="absolute font-['Satoshi_Variable:Bold',sans-serif] leading-[0] left-[55px] not-italic text-[18px] text-black top-[358px] tracking-[1.8px]">
        <span className="leading-[normal]">{`Room Name `}</span>
        <span className="leading-[normal] text-[#d90101]">*</span>
      </p>
      <div className="absolute border border-[rgba(179,179,179,0.75)] border-solid h-[50px] left-[55px] rounded-[5px] top-[394px] w-[845px]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute h-[50px] left-[55px] top-[394px] w-[845px] px-4 bg-transparent border-0 outline-none font-['Satoshi_Variable:Regular',sans-serif] text-[16px] text-black"
        placeholder="Enter room name"
      />
    </div>
  );
}

function KeyboardArrowUp() {
  return (
    <div className="relative size-[24px]" data-name="keyboard_arrow_up">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="keyboard_arrow_up">
          <path d={svgPaths.p3c144b80} fill="var(--fill-0, #5B5B5D)" id="icon" />
        </g>
      </svg>
    </div>
  );
}

function CountryInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="absolute contents left-[55px] top-[246px]" data-name="Country Input">
      <p className="absolute font-['Satoshi_Variable:Bold',sans-serif] leading-[0] left-[55px] not-italic text-[18px] text-black top-[246px] tracking-[1.8px]">
        <span className="leading-[normal]">{`Country `}</span>
        <span className="leading-[normal] text-[#d90101]">*</span>
      </p>
      <div className="absolute border border-[rgba(179,179,179,0.75)] border-solid h-[50px] left-[55px] rounded-[5px] top-[282px] w-[408px]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute h-[50px] left-[55px] top-[282px] w-[408px] px-4 bg-transparent border-0 outline-none font-['Satoshi_Variable:Regular',sans-serif] text-[16px] text-black"
        placeholder="Enter country"
      />
      <div className="absolute flex items-center justify-center left-[426px] size-[24px] top-[295px]">
        <div className="flex-none rotate-180">
          <KeyboardArrowUp />
        </div>
      </div>
    </div>
  );
}

function BuildingTypeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="absolute contents left-[492px] top-[134px]" data-name="Building Type Input">
      <p className="absolute font-['Satoshi_Variable:Bold',sans-serif] leading-[0] left-[492px] not-italic text-[18px] text-black top-[134px] tracking-[1.8px] w-[152.344px] whitespace-pre-wrap">
        <span className="leading-[normal]">{`Building Type `}</span>
        <span className="leading-[normal] text-[#d90101]">*</span>
      </p>
      <div className="absolute border border-[rgba(179,179,179,0.75)] border-solid h-[50px] left-[492px] rounded-[5px] top-[170px] w-[408px]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute h-[50px] left-[492px] top-[170px] w-[408px] px-4 bg-transparent border-0 outline-none font-['Satoshi_Variable:Regular',sans-serif] text-[16px] text-black"
        placeholder="Enter building type"
      />
    </div>
  );
}

function UploadIcon() {
  return (
    <div className="absolute inset-[21.82%_67.68%_27.53%_20.9%]" data-name="upload icon">
      <div className="absolute inset-[-4.15%]">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 30.1707 30.1707">
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
    <div onClick={onClick} className="absolute h-[55px] left-1/2 -translate-x-1/2 top-[480px] w-[244px] cursor-pointer hover:opacity-80 transition-opacity" data-name="upload button">
      <div className="absolute bg-[#91f9d0] h-[55px] left-0 rounded-[27.5px] top-0 w-[244px]" />
      <p className="-translate-x-1/2 absolute font-['Satoshi_Variable:Bold',sans-serif] leading-[normal] left-[135px] not-italic text-[24px] text-black text-center top-[11px] tracking-[1.2px]">UPLOAD</p>
      <UploadIcon />
    </div>
  );
}

export default function OverlayFilePropertiesPopUp({ 
  formData, 
  onChange,
  onUpload,
  onCancel
}: { 
  formData: FormData; 
  onChange: (data: FormData) => void;
  onUpload: () => void;
  onCancel?: () => void;
}) {
  const handleFieldChange = (field: keyof FormData, value: string) => {
    onChange({
      ...formData,
      [field]: value
    });
  };

  void onCancel;

  return (
    <div className="bg-white overflow-clip relative rounded-[30px] h-[570px] w-full" data-name="Overlay - File Properties PopUp">
      <X />
      <p className="absolute font-['Aeonik_Extended_TRIAL:Medium',sans-serif] leading-[normal] left-[45px] not-italic text-[#000001] text-[48px] top-[45px]">{`File Properties `}</p>
      <ProjectNameInput value={formData.projectName} onChange={(value) => handleFieldChange('projectName', value)} />
      <RoomNameInput value={formData.roomName} onChange={(value) => handleFieldChange('roomName', value)} />
      <CountryInput value={formData.country} onChange={(value) => handleFieldChange('country', value)} />
      <BuildingTypeInput value={formData.buildingType} onChange={(value) => handleFieldChange('buildingType', value)} />
      <UploadButton onClick={onUpload} />
    </div>
  );
}