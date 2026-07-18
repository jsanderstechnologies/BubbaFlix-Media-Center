import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettings } from '../lib/settings';

const fetchM3U = async (url: string) => {
  const res = await fetch('/api/m3u', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error("Failed to fetch M3U");
  return res.json();
};

const fetchEPG = async (url: string) => {
  if (!url) return null;
  const res = await fetch('/api/epg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error("Failed to fetch EPG");
  return res.json();
};

interface IptvGuideProps {
  onPlayStream: (url: string, logo?: string) => void;
}

export default function IptvGuide({ onPlayStream }: IptvGuideProps) {
  const { systemSettings, userSettings } = useSettings();
  const [playlistUrl] = useState(systemSettings.iptvUrl || 'http://cord-cutter.net:8080/get.php?username=foyers1@rogers.com&password=9jguFdUq3Y&type=m3u_plus');
  const [epgUrl] = useState(systemSettings.epgUrl || 'http://cord-cutter.net:8080/xmltv.php?username=foyers1@rogers.com&password=9jguFdUq3Y');
  const [epgOffsetHours] = useState(Number(systemSettings.epgOffset || 0));
  const epgOffsetMs = epgOffsetHours * 60 * 60 * 1000;
  
  const [selectedCategory, setSelectedCategory] = useState<string>('All Channels');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute to refresh EPG active programs
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  
  const { data: parsedM3u, isLoading: isM3uLoading, error: m3uError } = useQuery({
    queryKey: ['m3u', playlistUrl],
    queryFn: () => fetchM3U(playlistUrl),
    staleTime: 5 * 60 * 1000,
  });

  const { data: parsedEpg, isLoading: isEpgLoading } = useQuery({
    queryKey: ['epg', epgUrl],
    queryFn: () => fetchEPG(epgUrl),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000, // Update hourly in background
    enabled: !!epgUrl,
  });

  const rawChannels = parsedM3u?.items || [];
  
  const enabledGroups = useMemo(() => {
    return userSettings?.enabledGroups || null;
  }, [userSettings]);

  const channels = useMemo(() => {
    if (enabledGroups === null) return rawChannels; // Never configured
    if (enabledGroups.length === 0) return []; // Explicitly empty
    return rawChannels.filter((c: any) => c.group?.title && enabledGroups.includes(c.group.title.trim()));
  }, [rawChannels, enabledGroups]);
  
  const categories = useMemo(() => {
    const groups = new Set<string>();
    channels.forEach((c: any) => {
      if (c.group?.title) {
        groups.add(c.group.title.trim());
      }
    });
    return ['All Channels', ...Array.from(groups).sort()];
  }, [channels]);

  const filteredChannels = useMemo(() => {
    if (selectedCategory === 'All Channels') return channels;
    return channels.filter((c: any) => c.group?.title?.trim() === selectedCategory);
  }, [channels, selectedCategory]);

  // For the UI we might just show the first 100 channels to avoid lag if it's huge
  const displayChannels = filteredChannels.slice(0, 100);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [isFitWidth, setIsFitWidth] = useState(true);
  const [timelineDurationHours, setTimelineDurationHours] = useState(3);
  const [zoomScale, setZoomScale] = useState(6);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const channelWidth = useMemo(() => {
    return containerWidth >= 640 ? 256 : 192;
  }, [containerWidth]);

  const availableTimelineWidth = useMemo(() => {
    return Math.max(300, containerWidth - channelWidth - 4);
  }, [containerWidth, channelWidth]);

  const pixelsPerMinute = useMemo(() => {
    if (isFitWidth) {
      return availableTimelineWidth / (timelineDurationHours * 60);
    }
    return zoomScale;
  }, [isFitWidth, availableTimelineWidth, timelineDurationHours, zoomScale]);

  const timelineWidth = useMemo(() => {
    if (isFitWidth) {
      return availableTimelineWidth;
    }
    return timelineDurationHours * 60 * pixelsPerMinute;
  }, [isFitWidth, availableTimelineWidth, timelineDurationHours, pixelsPerMinute]);

  const timeBlockIntervalMinutes = useMemo(() => {
    const minWidth = 60; // minimum width in pixels for a time block label to not overlap
    if (30 * pixelsPerMinute >= minWidth) return 30;
    if (60 * pixelsPerMinute >= minWidth) return 60;
    return 120;
  }, [pixelsPerMinute]);

  const [baseTime, setBaseTime] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - 1); // Start 1 hour before current hour
    return d;
  });

  const shiftTimeline = (direction: number) => {
    const shiftHours = direction * Math.max(1, timelineDurationHours - 1);
    setBaseTime(prev => new Date(prev.getTime() + shiftHours * 60 * 60 * 1000));
  };
  
  const resetTimeline = () => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - 1);
    setBaseTime(d);
  };

  const timeBlocks = useMemo(() => {
    const blocks = [];
    const totalMinutes = timelineDurationHours * 60;
    const numBlocks = Math.floor(totalMinutes / timeBlockIntervalMinutes);
    for (let i = 0; i < numBlocks; i++) {
      blocks.push(new Date(baseTime.getTime() + i * timeBlockIntervalMinutes * 60000));
    }
    return blocks;
  }, [baseTime, timelineDurationHours, timeBlockIntervalMinutes]);

  const getProgramsForTimeline = (channelId: string) => {
    if (!parsedEpg?.programs || !channelId) return [];
    
    const channelPrograms = parsedEpg.programs.filter((p: any) => p.channel === channelId);
    if (!channelPrograms.length) return [];

    const timelineStartTime = baseTime.getTime();
    const timelineEndTime = timelineStartTime + timelineDurationHours * 60 * 60 * 1000;
    
    return channelPrograms
      .map((p: any) => {
        const startMs = new Date(new Date(p.start).getTime() + epgOffsetMs).getTime();
        const stopMs = new Date(new Date(p.stop).getTime() + epgOffsetMs).getTime();
        return { ...p, startMs, stopMs };
      })
      .filter((p: any) => {
        return p.startMs < timelineEndTime && p.stopMs > timelineStartTime;
      })
      .map((p: any) => {
        const leftMs = Math.max(0, p.startMs - timelineStartTime);
        const rightMs = Math.min(timelineEndTime - timelineStartTime, p.stopMs - timelineStartTime);
        const leftPx = (leftMs / 60000) * pixelsPerMinute;
        const widthPx = ((rightMs - leftMs) / 60000) * pixelsPerMinute;
        return {
          ...p,
          leftPx,
          widthPx,
          isCurrent: currentTime.getTime() >= p.startMs && currentTime.getTime() < p.stopMs
        };
      });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  const epgScrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Scroll to current time minus ~30 minutes on mount or when timeline updates
    if (epgScrollRef.current && !isFitWidth) {
      const currentOffsetMs = currentTime.getTime() - baseTime.getTime();
      const currentOffsetPx = (currentOffsetMs / 60000) * pixelsPerMinute;
      // Scroll to current time, but pull back slightly so it's not right on the edge
      epgScrollRef.current.scrollLeft = Math.max(0, currentOffsetPx - 100);
    }
  }, [baseTime, isFitWidth, pixelsPerMinute]); // Only run when baseTime, mode, or scale updates

  // Calculate current time indicator position
  const currentTimePx = ((currentTime.getTime() - baseTime.getTime()) / 60000) * pixelsPerMinute;

  return (
    <div className="flex flex-col gap-6">
      {/* Categories Filter */}
      <div className="relative group flex items-center">
        <button 
          onClick={scrollLeft}
          className="absolute left-0 z-10 p-2 m-1 rounded-full bg-black/60 border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 backdrop-blur-sm shadow-lg"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div 
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 shrink-0 scroll-smooth w-full px-2"
        >
          {categories.map((cat) => (
            <button 
              key={cat} 
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold tracking-wider whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'}`}
            >
              {cat}
            </button>
          ))}
        </div>
        <button 
          onClick={scrollRight}
          className="absolute right-0 z-10 p-2 m-1 rounded-full bg-black/60 border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 backdrop-blur-sm shadow-lg"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* EPG Grid */}
      <div ref={containerRef} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col min-h-[550px] relative h-[78vh] max-h-[82vh]">
        {/* Date and Current Time Controls */}
        <div className="flex border-b border-white/10 bg-black/60 items-center justify-between p-2 px-4 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => shiftTimeline(-1)}
              className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white transition-colors"
              title="Previous Hours"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={resetTimeline}
              className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs font-medium text-white transition-colors"
              title="Go to Live Time"
            >
              Live
            </button>
            <button 
              onClick={() => shiftTimeline(1)}
              className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white transition-colors"
              title="Next Hours"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-xs text-white font-mono ml-4 hidden sm:block">
              {baseTime.toLocaleDateString()}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Fit Width / Scroll Mode Selector */}
            <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs font-medium text-white/80">
              <button
                onClick={() => setIsFitWidth(true)}
                className={`px-2.5 py-1 rounded-md transition-colors ${isFitWidth ? 'bg-emerald-600 text-white font-semibold' : 'hover:text-white'}`}
                title="Scale guide to fit the screen width"
              >
                Fit Page
              </button>
              <button
                onClick={() => setIsFitWidth(false)}
                className={`px-2.5 py-1 rounded-md transition-colors ${!isFitWidth ? 'bg-emerald-600 text-white font-semibold' : 'hover:text-white'}`}
                title="Scrollable guide width"
              >
                Scroll
              </button>
            </div>

            {/* Time Window Duration Selector */}
            <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 text-[11px] font-mono font-medium text-white/80">
              {[2, 3, 4, 6].map((hours) => (
                <button
                  key={hours}
                  onClick={() => setTimelineDurationHours(hours)}
                  className={`px-2 py-0.5 rounded-md transition-all ${timelineDurationHours === hours ? 'bg-white/10 text-white font-bold' : 'hover:text-white'}`}
                  title={`Show ${hours} Hour window`}
                >
                  {hours}H
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable EPG Area */}
        <div ref={epgScrollRef} className="flex-1 overflow-auto custom-scrollbar bg-black/20 relative">
          <div style={{ minWidth: '100%', width: isFitWidth ? '100%' : `${channelWidth + timelineWidth}px` }}>
            {/* EPG Header with Times */}
            <div className="flex border-b border-white/10 bg-black/80 sticky top-0 z-30 w-full backdrop-blur-md">
              {/* Sticky Channel Header */}
              <div className="w-48 sm:w-64 shrink-0 border-r border-white/10 p-2 flex items-center sticky left-0 z-40 bg-black/90">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Channels</span>
              </div>
              
              {/* Timeline Time Blocks */}
              <div className="relative flex" style={{ width: `${timelineWidth}px` }}>
                {timeBlocks.map((t, i) => (
                  <div key={i} className="absolute h-full border-l border-white/5 p-2 text-[10px] font-bold text-white font-mono" style={{ left: `${i * timeBlockIntervalMinutes * pixelsPerMinute}px`, width: `${timeBlockIntervalMinutes * pixelsPerMinute}px` }}>
                    {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                ))}
                
                {/* Current Time Indicator Line (Header part) */}
                {currentTimePx >= 0 && currentTimePx <= timelineWidth && (
                  <div className="absolute top-0 bottom-0 border-l border-emerald-500 z-50" style={{ left: `${currentTimePx}px` }}>
                     <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-emerald-500" />
                  </div>
                )}
              </div>
            </div>
            
            {/* EPG Channels Data */}
            <div className="flex flex-col relative w-full pb-8">
              {isM3uLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
                  <div className="text-emerald-400 animate-pulse font-medium">Loading playlist...</div>
                </div>
              )}
              {m3uError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
                  <div className="text-red-400 font-medium">Failed to load playlist.</div>
                </div>
              )}

              {/* Current Time Indicator Line (Body part) */}
              {currentTimePx >= 0 && currentTimePx <= timelineWidth && (
                <div className="absolute top-0 bottom-0 z-10 pointer-events-none flex" style={{ left: 0, right: 0 }}>
                  <div className="w-48 sm:w-64 shrink-0" />
                  <div className="relative flex-1" style={{ width: `${timelineWidth}px` }}>
                    <div className="absolute top-0 bottom-0 border-l border-emerald-500/50" style={{ left: `${currentTimePx}px` }} />
                  </div>
                </div>
              )}
              
              {!isM3uLoading && !m3uError && displayChannels.map((channel: any, i: number) => {
                const programs = channel.tvg?.id ? getProgramsForTimeline(channel.tvg.id) : [];
                
                return (
                <div key={i} className={`flex border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group ${i % 2 === 0 ? 'bg-black/20' : ''}`} onClick={() => onPlayStream(channel.url, channel.tvg?.logo)}>
                  
                  {/* Channel Info (Sticky Left) */}
                  <div className="w-48 sm:w-64 shrink-0 border-r border-white/10 p-2 py-1 flex items-center gap-3 sticky left-0 z-20 bg-black/80 backdrop-blur-sm group-hover:bg-white/5 h-10">
                    <div className="w-6 h-6 rounded bg-white/5 shadow-inner flex items-center justify-center overflow-hidden shrink-0">
                      {channel.tvg?.logo ? (
                        <img src={channel.tvg.logo} alt="" className="w-full h-full object-contain p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <span className="font-bold italic text-white/30 text-[8px]">TV</span>
                      )}
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-medium truncate group-hover:text-white transition-colors text-white">{channel.name || channel.tvg?.name || `Channel ${i+1}`}</span>
                    </div>
                  </div>
                  
                  {/* Timeline Programs Area */}
                  <div className="relative h-10" style={{ width: `${timelineWidth}px` }}>
                    {programs.map((p: any, idx: number) => (
                      <div 
                        key={idx} 
                        className={`absolute top-0 bottom-0 border-r border-white/10 p-1 px-2 flex flex-col justify-center overflow-hidden whitespace-nowrap text-ellipsis
                          ${p.isCurrent ? 'border-b-2 border-b-emerald-500 bg-emerald-900/20 text-emerald-100' : 'bg-black/20 text-white hover:bg-white/10'}`}
                        style={{ left: `${p.leftPx}px`, width: `${p.widthPx}px` }}
                        title={`${p.title?.[0]?.value} (${formatTime(p.start)} - ${formatTime(p.stop)})`}
                      >
                        <span className="text-[11px] font-medium truncate leading-tight">{p.title?.[0]?.value || 'Unknown Program'}</span>
                        <span className="text-[9px] opacity-60 font-mono truncate hidden sm:block">{formatTime(p.start)} - {formatTime(p.stop)}</span>
                      </div>
                    ))}
                    {programs.length === 0 && (
                       <div className="absolute inset-0 flex items-center px-4">
                         <span className="text-[10px] text-white/60 italic">No EPG data available in this time window</span>
                       </div>
                    )}
                  </div>

                </div>
              )})}
              {!isM3uLoading && displayChannels.length === 0 && (
                <div className="p-8 text-center text-white sticky left-0 w-full">No channels found in this playlist.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
