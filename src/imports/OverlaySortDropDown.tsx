import svgPaths from "./svg-3fegd443wx";

export default function OverlaySortDropDown({ onClose }: { onClose?: () => void }) {
  return (
    <div className="absolute" style={{ left: '19.95%', top: '15.28vw' }} data-name="Overlay - Sort Drop Down">
      <div className="absolute bg-white h-[120px] left-0 rounded-[8px] shadow-[2px_2px_10.4px_2px_rgba(0,0,0,0.25)] top-0 w-[220px]" />
      <div className="absolute contents leading-[normal] left-[56px] text-[18px] top-[24px]">
        <p className="absolute font-['Satoshi_Variable:Medium',sans-serif] font-medium left-[56px] text-[#7c7c7d] top-[70px]">Name</p>
        <p className="absolute font-['Satoshi_Variable:Black',sans-serif] font-black left-[56px] text-[#000001] top-[24px]">Date</p>
      </div>
      <div className="absolute left-[22px] overflow-clip size-[26px] top-[24px]" data-name="check">
        <div className="absolute bottom-1/4 left-[16.04%] right-[16.04%] top-[24.9%]" data-name="icon">
          <div className="absolute inset-[-8.82%_-6.51%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24.5618 18.8618">
              <path d={svgPaths.p1039c400} fill="var(--fill-0, #1D1B20)" id="icon" stroke="var(--stroke-0, black)" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}