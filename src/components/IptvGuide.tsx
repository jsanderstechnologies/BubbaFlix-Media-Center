import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Search, Play, Radio, Calendar } from 'lucide-react';
import { useSettings } from '../lib/settings';

const fetchM3U = async () => {
  const res = await fetch('/api/m3u', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error("Failed to fetch M3U");
  return res.json();
};

const fetchEPG = async () => {
  const res = await fetch('/api/epg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error("Failed to fetch EPG");
  return res.json();
};

interface IptvGuideProps {
  onPlayStream: (url: string, logo?: string, resumeTime?: number, context?: any) => void;
}

const getGroupTitle = (c: any): string => {
  if (!c) return '';
  if (typeof c.group === 'string') return c.group.trim();
  if (c.group?.title && typeof c.group.title === 'string') return c.group.title.trim();
  return '';
};

const getCategoryDetails = (categoryStr: string | undefined, titleStr: string, descStr: string) => {
  const text = `${categoryStr || ''} ${titleStr} ${descStr}`.toLowerCase();
  if (/\b(sport|sports|nfl|nba|mlb|nhl|football|basketball|baseball|soccer|hockey|wwe|ufc|boxing|racing|f1|nascar|golf|tennis|espn)\b/.test(text)) {
    return { name: 'Sports', icon: '🏀', border: 'border-amber-500/40', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  }
  if (/\b(news|headline|weather|cnn|msnbc|fox news|report|bbc|breaking|press)\b/.test(text)) {
    return { name: 'News', icon: '📰', border: 'border-blue-500/40', bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
  }
  if (/\b(movie|film|cinema|premiere|blockbuster|hbo|cinemax|showtime|starz)\b/.test(text)) {
    return { name: 'Movie', icon: '🎬', border: 'border-purple-500/40', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
  }
  if (/\b(kid|kids|cartoon|disney|nick|toon|anime|animation|jr)\b/.test(text)) {
    return { name: 'Kids', icon: '🎨', border: 'border-pink-500/40', bg: 'bg-pink-500/20 text-pink-300 border-pink-500/30' };
  }
  return { name: 'Entertainment', icon: '📺', border: 'border-slate-500/30', bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' };
};

export default function IptvGuide({ onPlayStream }: IptvGuideProps) {
  const { systemSettings, userSettings } = useSettings();
  const [epgOffsetHours] = useState(Number(systemSettings.epgOffset || 0));
  const epgOffsetMs = epgOffsetHours * 60 * 60 * 1000;
  
  const [selectedCategory, setSelectedCategory] = useState<string>('All Channels');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Currently focused/inspected program for top banner
  const [selectedProgram, setSelectedProgram] = useState<any>(null);

  // Update current time every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  
  const { data: parsedM3u, isLoading: isM3uLoading, error: m3uError } = useQuery({
    queryKey: ['m3u'],
    queryFn: fetchM3U,
    staleTime: 5 * 60 * 1000,
  });

  const { data: parsedEpg } = useQuery({
    queryKey: ['epg'],
    queryFn: fetchEPG,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });

  const rawChannels = useMemo(() => {
    if (Array.isArray(parsedM3u)) return parsedM3u;
    if (parsedM3u && Array.isArray(parsedM3u.items)) return parsedM3u.items;
    if (parsedM3u && Array.isArray(parsedM3u.channels)) return parsedM3u.channels;
    return [];
  }, [parsedM3u]);
  
  const enabledGroups = useMemo(() => {
    return userSettings?.enabledGroups && userSettings.enabledGroups.length > 0 ? userSettings.enabledGroups : null;
  }, [userSettings]);

  const channels = useMemo(() => {
    if (!enabledGroups || enabledGroups.length === 0) return rawChannels;
    const hasMatchingGroup = rawChannels.some((c: any) => enabledGroups.includes(getGroupTitle(c)));
    if (!hasMatchingGroup) return rawChannels;
    return rawChannels.filter((c: any) => {
      const g = getGroupTitle(c);
      return !g || enabledGroups.includes(g);
    });
  }, [rawChannels, enabledGroups]);
  
  const categories = useMemo(() => {
    const groups = new Set<string>();
    channels.forEach((c: any) => {
      const g = getGroupTitle(c);
      if (g) groups.add(g);
    });
    return ['All Channels', ...Array.from(groups).sort()];
  }, [channels]);

  const filteredChannels = useMemo(() => {
    let list = channels;
    if (selectedCategory !== 'All Channels') {
      list = list.filter((c: any) => getGroupTitle(c) === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c: any) => {
        const name = (c.name || c.title || '').toLowerCase();
        const group = getGroupTitle(c).toLowerCase();
        return name.includes(q) || group.includes(q);
      });
    }

    return list;
  }, [channels, selectedCategory, searchQuery]);

  const displayChannels = filteredChannels.slice(0, 300);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [isFitWidth, setIsFitWidth] = useState(true);
  const [timelineDurationHours, setTimelineDurationHours] = useState(3);
  const [zoomScale] = useState(6);

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
    return containerWidth >= 640 ? 270 : 200;
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
    const minWidth = 60;
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

  const extractString = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) {
      const first = val[0];
      if (typeof first === 'string') return first;
      if (first?.value) return String(first.value);
      if (first?._text) return String(first._text);
    }
    if (val.value) return String(val.value);
    if (val._text) return String(val._text);
    return String(val);
  };

  const sanitizeName = (str: string): string => {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/^(us|uk|ca|de|fr|es|it|au|latin|mx|br|world)\s*[:\|\-]\s*/i, '')
      .replace(/\b(1080p|720p|4k|fhd|hd|sd|hevc|h265|raw|vip|us)\b/gi, '')
      .replace(/[^a-z0-9]/gi, '');
  };

  const parseDateMs = (d: any): number => {
    if (!d) return 0;
    if (typeof d === 'number') return d;
    if (typeof d === 'string') {
      const m = d.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
      if (m) {
        const [_, y, month, day, h, min, s, tz] = m;
        const tzFormatted = tz ? `${tz.slice(0,3)}:${tz.slice(3)}` : 'Z';
        const isoStr = `${y}-${month}-${day}T${h}:${min}:${s}${tzFormatted}`;
        const t = new Date(isoStr).getTime();
        if (!isNaN(t)) return t;
      }
      const t = new Date(d).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  const epgChannelMap = useMemo(() => {
    if (!parsedEpg?.channels || !Array.isArray(parsedEpg.channels)) return new Map<string, string[]>();
    const map = new Map<string, string[]>();

    parsedEpg.channels.forEach((ch: any) => {
      const id = (ch.id || '').toString().toLowerCase();
      if (!id) return;
      const aliases: string[] = [id, sanitizeName(id)];

      if (Array.isArray(ch.displayName)) {
        ch.displayName.forEach((dn: any) => {
          const dStr = extractString(dn).toLowerCase();
          if (dStr) {
            aliases.push(dStr);
            aliases.push(sanitizeName(dStr));
          }
        });
      }

      map.set(id, Array.from(new Set(aliases.filter(Boolean))));
    });

    return map;
  }, [parsedEpg]);

  const timeBlocks = useMemo(() => {
    const blocks = [];
    const totalMinutes = timelineDurationHours * 60;
    const numBlocks = Math.floor(totalMinutes / timeBlockIntervalMinutes);
    for (let i = 0; i < numBlocks; i++) {
      blocks.push(new Date(baseTime.getTime() + i * timeBlockIntervalMinutes * 60000));
    }
    return blocks;
  }, [baseTime, timelineDurationHours, timeBlockIntervalMinutes]);

  const getProgramsForTimeline = (channel: any) => {
    if (!parsedEpg?.programs || !channel) return [];
    
    const chId = (channel.tvg?.id || channel.id || '').toString().toLowerCase();
    const chName = (channel.name || channel.title || '').toString().toLowerCase();
    const chTvgName = (channel.tvg?.name || '').toString().toLowerCase();

    const normId = sanitizeName(chId);
    const normName = sanitizeName(chName);
    const normTvgName = sanitizeName(chTvgName);

    const channelPrograms = parsedEpg.programs.filter((p: any) => {
      if (!p.channel) return false;
      const pc = String(p.channel).toLowerCase();
      const normPc = sanitizeName(pc);

      if (chId && pc === chId) return true;
      if (chName && pc === chName) return true;
      if (chTvgName && pc === chTvgName) return true;

      if (normId && normPc === normId) return true;
      if (normName && normPc === normName) return true;
      if (normTvgName && normPc === normTvgName) return true;

      const aliases = epgChannelMap.get(pc);
      if (aliases) {
        if (chId && aliases.includes(chId)) return true;
        if (chName && aliases.includes(chName)) return true;
        if (chTvgName && aliases.includes(chTvgName)) return true;
        if (normId && aliases.includes(normId)) return true;
        if (normName && aliases.includes(normName)) return true;
        if (normTvgName && aliases.includes(normTvgName)) return true;
      }

      return false;
    });

    if (!channelPrograms.length) return [];

    const timelineStartTime = baseTime.getTime();
    const timelineEndTime = timelineStartTime + timelineDurationHours * 60 * 60 * 1000;
    
    return channelPrograms
      .map((p: any) => {
        const rawStart = parseDateMs(p.start);
        const rawStop = parseDateMs(p.stop);
        const startMs = rawStart ? rawStart + epgOffsetMs : 0;
        const stopMs = rawStop ? rawStop + epgOffsetMs : 0;
        return { ...p, startMs, stopMs };
      })
      .filter((p: any) => p.startMs > 0 && p.stopMs > p.startMs && p.startMs < timelineEndTime && p.stopMs > timelineStartTime)
      .map((p: any) => {
        const leftMs = Math.max(0, p.startMs - timelineStartTime);
        const rightMs = Math.min(timelineEndTime - timelineStartTime, p.stopMs - timelineStartTime);
        const leftPx = (leftMs / 60000) * pixelsPerMinute;
        const widthPx = Math.max(10, ((rightMs - leftMs) / 60000) * pixelsPerMinute);
        
        const programTitle = extractString(p.title) || 'Unknown Program';
        const programDesc = extractString(p.desc) || '';
        const programCategory = extractString(p.category) || '';

        const isCurrent = currentTime.getTime() >= p.startMs && currentTime.getTime() < p.stopMs;
        const totalDurationMs = Math.max(1, p.stopMs - p.startMs);
        const elapsedMs = Math.max(0, currentTime.getTime() - p.startMs);
        const progressPct = isCurrent ? Math.min(100, Math.round((elapsedMs / totalDurationMs) * 100)) : 0;

        const categoryInfo = getCategoryDetails(programCategory, programTitle, programDesc);

        return {
          ...p,
          displayTitle: programTitle,
          displayDesc: programDesc,
          displayCategory: programCategory,
          categoryInfo,
          leftPx,
          widthPx,
          isCurrent,
          progressPct,
          channel
        };
      });
  };

  const formatTimeMs = (ms: number) => {
    if (!ms) return '';
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    if (epgScrollRef.current && !isFitWidth) {
      const currentOffsetMs = currentTime.getTime() - baseTime.getTime();
      const currentOffsetPx = (currentOffsetMs / 60000) * pixelsPerMinute;
      epgScrollRef.current.scrollLeft = Math.max(0, currentOffsetPx - 100);
    }
  }, [baseTime, isFitWidth, pixelsPerMinute]);

  const currentTimePx = ((currentTime.getTime() - baseTime.getTime()) / 60000) * pixelsPerMinute;

  // Active program displayed in top Dispatcharr inspector
  const activeInspectorProgram = selectedProgram || useMemo(() => {
    if (displayChannels.length > 0) {
      const firstProgs = getProgramsForTimeline(displayChannels[0]);
      const active = firstProgs.find(p => p.isCurrent) || firstProgs[0];
      if (active) return active;
      return {
        displayTitle: displayChannels[0].name || displayChannels[0].title || 'Live Stream',
        displayDesc: 'Live TV Broadcast',
        channel: displayChannels[0],
        categoryInfo: { name: 'Live', icon: '📺', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
      };
    }
    return null;
  }, [displayChannels, parsedEpg]);

  return (
    <div className="flex flex-col gap-5">
      {/* Dispatcharr Top Program Inspector Banner */}
      {activeInspectorProgram && (
        <div className="bg-gradient-to-r from-slate-900/90 via-slate-900/80 to-indigo-950/70 border border-white/15 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            {/* Channel Logo / Icon */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-black/60 border border-white/15 shadow-inner flex items-center justify-center overflow-hidden shrink-0">
              {activeInspectorProgram.channel?.tvg?.logo ? (
                <img 
                  src={activeInspectorProgram.channel.tvg.logo} 
                  alt="" 
                  className="w-full h-full object-contain p-1" 
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                />
              ) : (
                <Radio className="w-8 h-8 text-emerald-400 opacity-80" />
              )}
            </div>

            <div className="flex flex-col min-w-0 space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-white/50 bg-white/10 px-2 py-0.5 rounded">
                  {activeInspectorProgram.channel?.name || 'LIVE'}
                </span>

                {activeInspectorProgram.categoryInfo && (
                  <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1 ${activeInspectorProgram.categoryInfo.bg}`}>
                    <span>{activeInspectorProgram.categoryInfo.icon}</span>
                    <span>{activeInspectorProgram.categoryInfo.name}</span>
                  </span>
                )}

                {activeInspectorProgram.isCurrent && (
                  <span className="text-[10px] bg-red-600/90 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    <span>LIVE NOW</span>
                  </span>
                )}
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate leading-snug">
                {activeInspectorProgram.displayTitle}
              </h2>

              {activeInspectorProgram.startMs > 0 && (
                <div className="flex items-center gap-3 text-xs text-white/70 font-mono">
                  <span>{formatTimeMs(activeInspectorProgram.startMs)} - {formatTimeMs(activeInspectorProgram.stopMs)}</span>
                  {activeInspectorProgram.isCurrent && activeInspectorProgram.progressPct > 0 && (
                    <span className="text-emerald-400 font-bold">
                      • {activeInspectorProgram.progressPct}% Completed
                    </span>
                  )}
                </div>
              )}

              {activeInspectorProgram.displayDesc && (
                <p className="text-xs text-white/70 line-clamp-2 mt-1 leading-relaxed max-w-3xl">
                  {activeInspectorProgram.displayDesc}
                </p>
              )}
            </div>
          </div>

          {/* Action Button */}
          {activeInspectorProgram.channel && (
            <button
              onClick={() => onPlayStream(
                activeInspectorProgram.channel.url, 
                activeInspectorProgram.channel.tvg?.logo, 
                0, 
                { isLive: true, backupUrls: activeInspectorProgram.channel.backupUrls || [] }
              )}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-950/50 border border-emerald-400/40 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer self-stretch md:self-auto justify-center"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Watch Stream</span>
            </button>
          )}
        </div>
      )}

      {/* Dispatcharr Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channels or shows..."
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-white/40 outline-none focus:border-emerald-500/50 transition-colors shadow-inner"
          />
        </div>

        {/* Categories Horizontal Scroll */}
        <div className="relative group flex items-center flex-1 min-w-0">
          <button 
            onClick={scrollLeft}
            className="absolute left-0 z-10 p-1.5 rounded-full bg-black/80 border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 backdrop-blur-sm shadow"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div 
            ref={scrollContainerRef}
            className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 shrink-0 scroll-smooth w-full px-1"
          >
            {categories.map((cat) => (
              <button 
                key={cat} 
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer ${selectedCategory === cat ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40' : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:text-white'}`}
              >
                {cat}
              </button>
            ))}
          </div>
          <button 
            onClick={scrollRight}
            className="absolute right-0 z-10 p-1.5 rounded-full bg-black/80 border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 backdrop-blur-sm shadow"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* EPG Timeline Grid */}
      <div ref={containerRef} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 relative shadow-2xl">
        {/* Date, Navigation, and Grid View Controls Header */}
        <div className="flex border-b border-white/10 bg-black/80 items-center justify-between p-2.5 px-4 shrink-0 flex-wrap gap-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => shiftTimeline(-1)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer"
              title="Previous Hours"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button 
              onClick={resetTimeline}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-md cursor-pointer"
              title="Jump to Current Live Time"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>LIVE NOW</span>
            </button>

            <button 
              onClick={() => shiftTimeline(1)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer"
              title="Next Hours"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="text-xs text-white/80 font-mono ml-3 hidden sm:flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-md border border-white/10">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>{baseTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Fit Width / Scroll Mode Selector */}
            <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs font-medium text-white/80">
              <button
                onClick={() => setIsFitWidth(true)}
                className={`px-2.5 py-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer ${isFitWidth ? 'bg-emerald-600 text-white font-bold' : 'hover:text-white'}`}
                title="Scale guide to fit the screen width"
              >
                Fit Page
              </button>
              <button
                onClick={() => setIsFitWidth(false)}
                className={`px-2.5 py-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer ${!isFitWidth ? 'bg-emerald-600 text-white font-bold' : 'hover:text-white'}`}
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
                  className={`px-2 py-0.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer ${timelineDurationHours === hours ? 'bg-white/20 text-white font-bold' : 'hover:text-white'}`}
                  title={`Show ${hours} Hour window`}
                >
                  {hours}H
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable EPG Area */}
        <div ref={epgScrollRef} className="flex-1 overflow-auto custom-scrollbar bg-slate-950/80 relative">
          <div style={{ minWidth: '100%', width: isFitWidth ? '100%' : `${channelWidth + timelineWidth}px` }}>
            {/* EPG Header with Times */}
            <div className="flex border-b border-white/10 bg-black/90 sticky top-0 z-30 w-full backdrop-blur-md">
              {/* Sticky Channel Header */}
              <div className="w-52 sm:w-68 shrink-0 border-r border-white/10 p-2.5 px-4 flex items-center justify-between sticky left-0 z-40 bg-black/95">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Channels</span>
                <span className="text-[10px] font-mono text-white/50">{displayChannels.length} total</span>
              </div>
              
              {/* Timeline Time Blocks */}
              <div className="relative flex" style={{ width: `${timelineWidth}px` }}>
                {timeBlocks.map((t, i) => (
                  <div 
                    key={i} 
                    className="absolute h-full border-l border-white/10 p-2 text-[11px] font-bold text-white/90 font-mono flex items-center" 
                    style={{ left: `${i * timeBlockIntervalMinutes * pixelsPerMinute}px`, width: `${timeBlockIntervalMinutes * pixelsPerMinute}px` }}
                  >
                    {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                ))}
                
                {/* Current Time Red/Emerald Line Indicator (Header part) */}
                {currentTimePx >= 0 && currentTimePx <= timelineWidth && (
                  <div className="absolute top-0 bottom-0 border-l-2 border-emerald-400 z-50 pointer-events-none" style={{ left: `${currentTimePx}px` }}>
                    <div className="absolute -top-1.5 -left-2 px-1.5 py-0.5 rounded-full bg-emerald-500 text-black text-[9px] font-bold font-mono shadow-md">
                      NOW
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* EPG Channels & Program Rows */}
            <div className="flex flex-col relative w-full pb-8 divide-y divide-white/5">
              {isM3uLoading && (
                <div className="p-12 text-center text-emerald-400 animate-pulse font-medium">Loading IPTV channels & guide data...</div>
              )}
              {m3uError && (
                <div className="p-12 text-center text-red-400 font-medium">Failed to load playlist streams.</div>
              )}

              {/* Vertical NOW Line across all rows */}
              {currentTimePx >= 0 && currentTimePx <= timelineWidth && (
                <div className="absolute top-0 bottom-0 z-10 pointer-events-none flex" style={{ left: 0, right: 0 }}>
                  <div className="w-52 sm:w-68 shrink-0" />
                  <div className="relative flex-1" style={{ width: `${timelineWidth}px` }}>
                    <div className="absolute top-0 bottom-0 border-l-2 border-emerald-500/60 shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ left: `${currentTimePx}px` }} />
                  </div>
                </div>
              )}
              
              {!isM3uLoading && !m3uError && displayChannels.map((channel: any, i: number) => {
                const programs = getProgramsForTimeline(channel);
                
                return (
                <div 
                  key={i} 
                  tabIndex={0}
                  className={`focusable flex border-b border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer group focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500/50 ${i % 2 === 0 ? 'bg-black/20' : ''}`} 
                  onClick={() => onPlayStream(channel.url, channel.tvg?.logo, 0, { isLive: true, backupUrls: channel.backupUrls || [] })}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') {
                      if (epgScrollRef.current) {
                        const maxScroll = epgScrollRef.current.scrollWidth - epgScrollRef.current.clientWidth;
                        if (epgScrollRef.current.scrollLeft < maxScroll - 5) {
                          e.preventDefault();
                          e.stopPropagation();
                          epgScrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
                        }
                      }
                    } else if (e.key === 'ArrowLeft') {
                      if (epgScrollRef.current && epgScrollRef.current.scrollLeft > 5) {
                        e.preventDefault();
                        e.stopPropagation();
                        epgScrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
                      }
                    }
                  }}
                >
                  
                  {/* Channel Column (Sticky Left) */}
                  <div className="w-52 sm:w-68 shrink-0 border-r border-white/10 p-2.5 py-1.5 flex items-center gap-3 sticky left-0 z-20 bg-black/90 backdrop-blur-md group-hover:bg-slate-900/90 h-12">
                    <span className="text-[10px] font-mono font-bold text-white/40 w-5 shrink-0 text-right">
                      #{i + 1}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-white/5 shadow-inner flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                      {channel.tvg?.logo ? (
                        <img 
                          src={channel.tvg.logo} 
                          alt="" 
                          className="w-full h-full object-contain p-0.5" 
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                        />
                      ) : (
                        <Radio className="w-4 h-4 text-white/40" />
                      )}
                    </div>
                    <div className="flex flex-col truncate flex-1 min-w-0">
                      <span className="text-xs font-bold truncate text-white group-hover:text-emerald-400 transition-colors">
                        {channel.name || channel.tvg?.name || `Channel ${i+1}`}
                      </span>
                      <span className="text-[10px] text-white/50 truncate">
                        {getGroupTitle(channel) || 'IPTV Stream'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Timeline Programs Area */}
                  <div className="relative h-12" style={{ width: `${timelineWidth}px` }}>
                    {programs.map((p: any, idx: number) => (
                      <div 
                        key={idx} 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProgram(p);
                          onPlayStream(channel.url, channel.tvg?.logo, 0, { isLive: true, backupUrls: channel.backupUrls || [] });
                        }}
                        onMouseEnter={() => setSelectedProgram(p)}
                        className={`absolute top-0 bottom-0 border-r border-white/10 p-1.5 px-2.5 flex flex-col justify-center overflow-hidden whitespace-nowrap text-ellipsis transition-all cursor-pointer select-none group/card
                          ${p.isCurrent 
                            ? 'bg-gradient-to-r from-emerald-950/70 via-emerald-900/40 to-slate-900/80 border-t border-t-emerald-500/60 text-emerald-100 shadow-md' 
                            : 'bg-black/30 text-white/90 hover:bg-white/10 hover:text-white'}`}
                        style={{ left: `${p.leftPx}px`, width: `${p.widthPx}px` }}
                        title={`${p.displayTitle} (${formatTimeMs(p.startMs)} - ${formatTimeMs(p.stopMs)}) ${p.displayDesc}`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {p.categoryInfo && (
                            <span className="text-[10px]">{p.categoryInfo.icon}</span>
                          )}
                          <span className="text-[11px] font-semibold truncate leading-tight group-hover/card:text-emerald-300">
                            {p.displayTitle}
                          </span>
                        </div>

                        <span className="text-[9px] opacity-60 font-mono truncate hidden sm:block mt-0.5">
                          {formatTimeMs(p.startMs)} - {formatTimeMs(p.stopMs)}
                        </span>

                        {/* Progress Bar for Currently Airing Program */}
                        {p.isCurrent && p.progressPct > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 overflow-hidden">
                            <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${p.progressPct}%` }} />
                          </div>
                        )}
                      </div>
                    ))}

                    {programs.length === 0 && (
                      <div className="absolute inset-0 flex items-center px-4">
                        <span className="text-[10px] text-white/50 italic">No guide data for this time window</span>
                      </div>
                    )}
                  </div>

                </div>
              )})}

              {!isM3uLoading && displayChannels.length === 0 && (
                <div className="p-12 text-center text-white/60 font-medium">No IPTV channels found matching your search.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
