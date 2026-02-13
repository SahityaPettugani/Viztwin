import svgPaths from "./svg-m24gfnolaz";
import img59L6StudyRoomBasePicture1 from "../assets/63c2d6ad6ad4dafbeb3b47047743db0359a4c28f.png";
import img55L6RecreRoomBasePicture1 from "../assets/f4426c23e719d88147fed0f0f8a60d42a8ab3664.png";
import imgB55L6MusicRoomBasePicture1 from "../assets/09d6325af24c6590bfd6480678461f76b8b1cf97.png";
import imgHostelRoomBasePicture1 from "../assets/5eaf8848e58c99fc5d53685aa1231a9f6f9e8f61.png";
import img59L2DanceroomBasePicture1 from "../assets/84f5580434199e9586e40432c7839271cf5d46ab.png";
import { StandardizedHeaderS, Plus } from './SharedHeader';
import { useState } from 'react';
import ModelViewer from '../app/components/ModelViewer';
import OverlayFiltersSideBar from './OverlayFiltersSideBar';
import OverlaySortDropDown from './OverlaySortDropDown';

interface Project {
  id: string;
  title: string;
  date: string;
  image: string;
  pointCloudRawUrl?: string;
  pointCloudSemanticUrl?: string;
  pointCloudInstancedUrl?: string;
  pointCloudUrl?: string;
}

function FilterIcon() {
  return (
    <div className="relative shrink-0 w-[1.42vw] h-[1.42vw]" data-name="Filter Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 27.3135 27.3135">
        <g id="Group">
          <path d="M1.15677 5.84476H16.7816" id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.31353" />
          <path d={svgPaths.p3ecefe70} id="Vector_2" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.31353" />
          <path d="M26.1568 21.4692H16.7819" id="Vector_3" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.31353" />
          <path d="M7.4067 21.4692H1.15677" id="Vector_4" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.31353" />
          <path d={svgPaths.p8d05b80} id="Vector_5" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.31353" />
        </g>
      </svg>
    </div>
  );
}

function FilterButton({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} className="absolute h-[3.65vw] left-[4.27%] top-[10.63vw] w-[14.58vw] cursor-pointer hover:opacity-90 transition-opacity" data-name="Filter Button">
      <div className="absolute bg-[#000001] h-full left-0 rounded-[1.04vw] top-0 w-full" />
      <div className="absolute flex gap-[0.52vw] items-center left-[2.97vw] top-[0.99vw]">
        <FilterIcon />
        <p className="font-['Satoshi_Variable:Black',sans-serif] font-black leading-[normal] not-italic text-[1.25vw] text-white text-center">All Filters</p>
      </div>
    </div>
  );
}

function Heart() {
  return (
    <div className="absolute bottom-[3.65vw] right-[1.46vw] w-[2.08vw] h-[2.08vw]" data-name="Heart">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 40 40">
        <g id="Heart">
          <path d={svgPaths.p391dad80} id="Icon" stroke="var(--stroke-0, #1E1E1E)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        </g>
      </svg>
    </div>
  );
}

function NewProjButton({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} className="absolute bg-[#91f9d0] flex gap-[0.52vw] h-[2.86vw] items-center justify-center left-[4.27%] px-[1.98vw] py-[0.57vw] rounded-[1.43vw] top-[29.22vw] w-[17.19vw] cursor-pointer hover:bg-[#7ee6bc] transition-colors" data-name="New proj button">
      <Plus />
      <p className="font-['Satoshi_Variable:Medium',sans-serif] leading-[normal] not-italic text-[#000001] text-[1.25vw] text-center whitespace-nowrap">NEW PROJECT</p>
    </div>
  );
}

function ProjectCard({ 
  image, 
  title, 
  date, 
  left, 
  top,
  onClick 
}: { 
  image: string; 
  title: string; 
  date: string; 
  left: string; 
  top: string;
  onClick: () => void;
}) {
  return (
    <div 
      className="absolute h-[29.17vw] w-[29vw] cursor-pointer transition-transform hover:scale-[1.02]" 
      style={{ left, top }} 
      data-name="Project Card"
      onClick={onClick}
    >
      <div className="absolute bg-[#e8e9eb] inset-0 rounded-[1.56vw]" />
      <Heart />
      <div className="absolute h-[20.83vw] left-[1.46vw] rounded-[0.94vw] top-[1.46vw] w-[26.09vw]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[0.94vw]">
          <img alt="" className="absolute h-full left-[-6.25%] max-w-none top-0 w-[112.86%]" src={image} />
        </div>
      </div>
      <p className="absolute font-['Satoshi_Variable:Medium',sans-serif] leading-[normal] left-[1.46vw] not-italic text-[#000001] text-[1.25vw] top-[23.49vw]">{title}</p>
      <p className="absolute font-['Satoshi_Variable:Regular',sans-serif] leading-[normal] left-[1.46vw] not-italic text-[#000001] text-[0.83vw] top-[25.89vw]">{date}</p>
    </div>
  );
}

function KeyboardArrowUp() {
  return (
    <div className="relative w-[1.93vw] h-[1.93vw]" data-name="keyboard_arrow_up">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 37 37">
        <g id="keyboard_arrow_up">
          <path d={svgPaths.p1d89af80} fill="var(--fill-0, #1D1B20)" id="icon" />
        </g>
      </svg>
    </div>
  );
}

function SortButton({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} className="absolute h-[3.65vw] left-[19.95%] top-[10.63vw] w-[8.44vw] cursor-pointer hover:opacity-70 transition-opacity" data-name="Sort Button">
      <div className="absolute border-[0.21vw] border-[#d7d7d7] border-solid h-full left-0 rounded-[1.04vw] top-0 w-full" />
      <div className="absolute flex gap-[0.52vw] items-center left-[1.41vw] top-[0.83vw]">
        <p className="font-['Satoshi_Variable:Black',sans-serif] font-black leading-[normal] not-italic text-[#000001] text-[1.25vw]">Sort</p>
        <div className="flex items-center justify-center w-[1.93vw] h-[1.93vw]">
          <div className="rotate-180">
            <KeyboardArrowUp />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DesktopProjectLibrary({
  onNavigateHome,
  onNavigateGetStarted,
  onNavigateLibrary,
  onOpenUpload,
  projects = []
}: {
  onNavigateHome: () => void;
  onNavigateGetStarted: () => void;
  onNavigateLibrary: () => void;
  onOpenUpload: () => void;
  projects?: Project[];
}) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedPointCloud, setSelectedPointCloud] = useState<{
    raw?: string;
    semantic?: string;
    instanced?: string;
  } | undefined>(undefined);
  const [selectedTitle, setSelectedTitle] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [showSort, setShowSort] = useState(false);

  const handleOpenFilter = () => {
    setShowFilter(true);
    setTimeout(() => setIsFilterOpen(true), 10);
  };

  const handleCloseFilter = () => {
    setIsFilterOpen(false);
    setTimeout(() => setShowFilter(false), 300);
  };

  const handleOpenSort = () => {
    setShowSort(true);
    setTimeout(() => setIsSortOpen(true), 10);
  };

  const handleCloseSort = () => {
    setIsSortOpen(false);
    setTimeout(() => setShowSort(false), 300);
  };

  // Calculate grid positions for new projects
  const getGridPosition = (index: number) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    
    const leftPositions = ['4.27%', '35.52%', '66.77%'];
    const topBase = 16.04; // vw
    const rowHeight = 30.99; // vw
    
    return {
      left: leftPositions[col],
      top: `${topBase + (row * rowHeight)}vw`
    };
  };

  const handleProjectClick = (
    image: string,
    title: string,
    urls?: {
      raw?: string;
      semantic?: string;
      instanced?: string;
    }
  ) => {
    setSelectedProject(image);
    setSelectedTitle(title);
    setSelectedPointCloud(urls);
  };

  return (
    <div className="bg-white relative w-full min-h-screen overflow-x-hidden" data-name="Desktop - Project Library">
      {/* Header spacing */}
      <div className="h-[8.8vw]" />
      
      {/* Filter and Sort buttons */}
      <FilterButton onClick={handleOpenFilter} />
      <SortButton onClick={handleOpenSort} />
      
      {/* New Project Button - First card position */}
      <div className="absolute h-[29.17vw] left-[4.27%] top-[16.04vw] w-[29vw]">
        <div className="absolute bg-[#e8e9eb] inset-0 rounded-[1.56vw]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div onClick={onOpenUpload} className="bg-[#91f9d0] flex gap-[0.52vw] h-[2.86vw] items-center justify-center px-[1.98vw] py-[0.57vw] rounded-[1.43vw] cursor-pointer hover:bg-[#7ee6bc] transition-colors">
            <Plus />
            <p className="font-['Satoshi_Variable:Medium',sans-serif] leading-[normal] not-italic text-[#000001] text-[1.25vw] text-center whitespace-nowrap">NEW PROJECT</p>
          </div>
        </div>
      </div>
      
      {/* Dynamically render new uploaded projects */}
      {projects.map((project, index) => {
        const position = getGridPosition(index + 1); // +1 to skip the NEW PROJECT button position
        return (
          <ProjectCard
            key={project.id}
            image={project.image || img59L6StudyRoomBasePicture1}
            title={project.title}
            date={project.date}
            left={position.left}
            top={position.top}
            onClick={() => handleProjectClick(project.image || img59L6StudyRoomBasePicture1, project.title, {
              raw: project.pointCloudRawUrl,
              semantic: project.pointCloudSemanticUrl,
              instanced: project.pointCloudInstancedUrl || project.pointCloudUrl
            })}
          />
        );
      })}
      
      {/* Original Project Cards */}
      {/* Row 1 - Position 2 */}
      <ProjectCard
        image={img59L6StudyRoomBasePicture1}
        title="SUTD Blk 59 - Level 6 Study Room"
        date="12 November 2025"
        left={getGridPosition(1 + projects.length).left}
        top={getGridPosition(1 + projects.length).top}
        onClick={() => handleProjectClick(img59L6StudyRoomBasePicture1, "SUTD Blk 59 - Level 6 Study Room")}
      />
      
      {/* Row 1 - Position 3 */}
      <ProjectCard
        image={img55L6RecreRoomBasePicture1}
        title="SUTD Blk 55 - Level 6 Recreational R,,,"
        date="31 October 2025"
        left={getGridPosition(2 + projects.length).left}
        top={getGridPosition(2 + projects.length).top}
        onClick={() => handleProjectClick(img55L6RecreRoomBasePicture1, "SUTD Blk 55 - Level 6 Recreational Room")}
      />
      
      {/* Row 2 - Position 1 */}
      <ProjectCard
        image={imgB55L6MusicRoomBasePicture1}
        title="SUTD Blk 55 - Music Room"
        date="13 May 2025"
        left={getGridPosition(3 + projects.length).left}
        top={getGridPosition(3 + projects.length).top}
        onClick={() => handleProjectClick(imgB55L6MusicRoomBasePicture1, "SUTD Blk 55 - Music Room")}
      />
      
      {/* Row 2 - Position 2 */}
      <ProjectCard
        image={imgHostelRoomBasePicture1}
        title="SUTD Blk 55 - Hostel Room"
        date="6 July 2024"
        left={getGridPosition(4 + projects.length).left}
        top={getGridPosition(4 + projects.length).top}
        onClick={() => handleProjectClick(imgHostelRoomBasePicture1, "SUTD Blk 55 - Hostel Room")}
      />
      
      {/* Row 2 - Position 3 */}
      <ProjectCard
        image={img59L2DanceroomBasePicture1}
        title="SUTD Blk 59 - Level 2 Dance Room"
        date="25 April 2024"
        left={getGridPosition(5 + projects.length).left}
        top={getGridPosition(5 + projects.length).top}
        onClick={() => handleProjectClick(img59L2DanceroomBasePicture1, "SUTD Blk 59 - Level 2 Dance Room")}
      />
      
      {/* Header */}
      <StandardizedHeaderS 
        onNavigateHome={onNavigateHome}
        onNavigateGetStarted={onNavigateGetStarted}
        onNavigateLibrary={onNavigateLibrary}
        activePage="library"
      />
      
      {/* Bottom spacing */}
      <div className="h-[10vw]" />
      
      {/* Model Viewer */}
      {selectedProject && (
        <ModelViewer
          projectTitle={selectedTitle}
          onClose={() => {
            setSelectedProject(null);
            setSelectedTitle('');
            setSelectedPointCloud(undefined);
          }}
          onNavigateHome={onNavigateHome}
          onNavigateGetStarted={onNavigateGetStarted}
          onNavigateLibrary={onNavigateLibrary}
          rawPointCloudUrl={selectedPointCloud?.raw}
          semanticPointCloudUrl={selectedPointCloud?.semantic}
          instancedPointCloudUrl={selectedPointCloud?.instanced}
        />
      )}
      
      {/* Filter Overlay */}
      {showFilter && (
        <div 
          className="fixed inset-0 z-50"
          style={{ top: 0, left: 0 }}
        >
          {/* Semi-transparent backdrop - covers entire screen */}
          <div 
            className="absolute inset-0 bg-black transition-opacity duration-300"
            style={{ 
              opacity: isFilterOpen ? 0.5 : 0 
            }}
            onClick={handleCloseFilter}
          />
          
          {/* Sliding sidebar */}
          <div 
            className="absolute left-0 top-0 h-full transition-transform duration-300 ease-in-out"
            style={{ 
              width: '528px',
              transform: isFilterOpen ? 'translateX(0)' : 'translateX(-100%)'
            }}
          >
            <OverlayFiltersSideBar onClose={handleCloseFilter} />
          </div>
        </div>
      )}
      
      {/* Sort Overlay */}
      {showSort && (
        <div 
          className="fixed inset-0 z-50"
          style={{ top: 0, left: 0 }}
        >
          {/* Transparent backdrop - covers entire screen */}
          <div 
            className="absolute inset-0 transition-opacity duration-300"
            style={{ 
              opacity: isSortOpen ? 1 : 0 
            }}
            onClick={handleCloseSort}
          />
          
          {/* Sort dropdown */}
          <div 
            className="transition-opacity duration-300 ease-in-out"
            style={{ 
              opacity: isSortOpen ? 1 : 0
            }}
          >
            <OverlaySortDropDown onClose={handleCloseSort} />
          </div>
        </div>
      )}
    </div>
  );
}