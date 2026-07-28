import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Newspaper, Globe, MapPin, Flag, Trophy, RefreshCw, ExternalLink, AlertCircle, Building2, Activity } from 'lucide-react';
import { useSettings } from '../lib/settings';

export interface Article {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  publishedAt: string;
  source: string;
  apiSource: 'NewsAPI' | 'GNews';
}

export interface ScoreGame {
  id: string;
  name: string;
  shortName: string;
  status: string; // "Scheduled", "In Progress", "Final"
  statusDetail: string; // e.g. "4th Qtr 2:15" or "Final/OT"
  isLive: boolean;
  homeTeam: {
    name: string;
    abbreviation: string;
    logo: string;
    score: string;
    isWinner?: boolean;
  };
  awayTeam: {
    name: string;
    abbreviation: string;
    logo: string;
    score: string;
    isWinner?: boolean;
  };
}

const STATE_NAME_MAP: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

async function resolveLocation(query: string): Promise<{ city: string; state: string }> {
  const clean = query.trim();
  if (!clean) return { city: 'Austin', state: 'Texas' };

  if (clean.includes(',')) {
    const parts = clean.split(',').map(s => s.trim());
    const city = parts[0] || 'Austin';
    let state = parts[1] || '';
    if (state.length === 2 && STATE_NAME_MAP[state.toUpperCase()]) {
      state = STATE_NAME_MAP[state.toUpperCase()];
    }
    return { city, state: state || 'Texas' };
  }

  try {
    const isZip = /^\d{5}(-\d{4})?$/.test(clean);
    const searchUrl = isZip
      ? `https://api.zippopotam.us/us/${clean.substring(0, 5)}`
      : `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=1&language=en&format=json`;

    if (isZip) {
      const zipRes = await fetch(searchUrl).then(r => r.json()).catch(() => null);
      if (zipRes && zipRes.places && zipRes.places[0]) {
        const place = zipRes.places[0];
        const city = place['place name'] || clean;
        const stateAbbr = place['state abbreviation'] || '';
        const stateName = place['state'] || STATE_NAME_MAP[stateAbbr.toUpperCase()] || stateAbbr;
        return { city, state: stateName };
      }
    } else {
      const geoRes = await fetch(searchUrl).then(r => r.json()).catch(() => null);
      if (geoRes && geoRes.results?.[0]) {
        const res = geoRes.results[0];
        const city = res.name || clean;
        const stateName = res.admin1 || 'Texas';
        return { city, state: stateName };
      }
    }
  } catch (err) {
    console.error('Error resolving news location:', err);
  }

  return { city: clean, state: 'Texas' };
}

export default function NewsPanel() {
  const [activeTab, setActiveTab] = useState<'local' | 'regional' | 'national' | 'world' | 'sports' | 'scores'>('local');
  const [activeSport, setActiveSport] = useState<'nfl' | 'nba' | 'mlb' | 'nhl' | 'ncaa_football' | 'ncaa_basketball' | 'soccer'>('nfl');
  const { userSettings } = useSettings();

  const locationQuery = userSettings.weatherLocation || 'Austin, TX';
  const [resolvedLoc, setResolvedLoc] = useState<{ city: string; state: string }>({ city: 'Austin', state: 'Texas' });

  useEffect(() => {
    let isMounted = true;
    resolveLocation(locationQuery).then(res => {
      if (isMounted) setResolvedLoc(res);
    });
    return () => { isMounted = false; };
  }, [locationQuery]);

  const { city, state } = resolvedLoc;

  const fetchNewsForTab = async (tab: string, currentCity: string, currentState: string): Promise<Article[]> => {
    const articles: Article[] = [];

    const fetchNewsApi = async (params: string) => {
      try {
        const res = await fetch(`/api/news/newsapi?${params}`);
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.articles) return [];
        return data.articles.map((item: any, idx: number) => ({
          id: `newsapi-${idx}-${item.url}`,
          title: item.title,
          description: item.description || '',
          url: item.url,
          imageUrl: item.urlToImage || '',
          publishedAt: item.publishedAt,
          source: item.source?.name || 'NewsAPI',
          apiSource: 'NewsAPI' as const
        }));
      } catch (err) {
        console.error('Error fetching NewsAPI:', err);
        return [];
      }
    };

    const fetchGNews = async (params: string) => {
      try {
        const res = await fetch(`/api/news/gnews?${params}`);
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.articles) return [];
        return data.articles.map((item: any, idx: number) => ({
          id: `gnews-${idx}-${item.url}`,
          title: item.title,
          description: item.description || '',
          url: item.url,
          imageUrl: item.image || '',
          publishedAt: item.publishedAt,
          source: item.source?.name || 'GNews',
          apiSource: 'GNews' as const
        }));
      } catch (err) {
        console.error('Error fetching GNews:', err);
        return [];
      }
    };

    let newsApiParams = '';
    let gnewsParams = '';

    switch (tab) {
      case 'local':
        newsApiParams = `q=${encodeURIComponent(currentCity)}`;
        gnewsParams = `q=${encodeURIComponent(currentCity)}`;
        break;
      case 'regional':
        newsApiParams = `q=${encodeURIComponent(currentState)}`;
        gnewsParams = `q=${encodeURIComponent(currentState)}`;
        break;
      case 'national':
        newsApiParams = `country=us&category=general`;
        gnewsParams = `topic=nation&country=us`;
        break;
      case 'world':
        newsApiParams = `q=world`;
        gnewsParams = `topic=world`;
        break;
      case 'sports':
        newsApiParams = `category=sports&country=us`;
        gnewsParams = `topic=sports&country=us`;
        break;
    }

    const [newsApiList, gnewsList] = await Promise.all([
      fetchNewsApi(newsApiParams),
      fetchGNews(gnewsParams)
    ]);

    articles.push(...newsApiList, ...gnewsList);

    const seenUrls = new Set<string>();
    const uniqueArticles: Article[] = [];
    for (const art of articles) {
      if (!art.title || art.title.includes('[Removed]')) continue;
      const cleanUrl = art.url.split('?')[0];
      if (!seenUrls.has(cleanUrl)) {
        seenUrls.add(cleanUrl);
        uniqueArticles.push(art);
      }
    }

    uniqueArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return uniqueArticles;
  };

  const fetchScoresForSport = async (sport: string): Promise<ScoreGame[]> => {
    try {
      const res = await fetch(`/api/sports/scores?sport=${sport}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.events || !Array.isArray(data.events)) return [];

      return data.events.map((evt: any) => {
        const comp = evt.competitions?.[0];
        const homeComp = comp?.competitors?.find((c: any) => c.homeAway === 'home');
        const awayComp = comp?.competitors?.find((c: any) => c.homeAway === 'away');
        const statusState = evt.status?.type?.state; // "pre", "in", "post"

        return {
          id: evt.id || `game-${Math.random()}`,
          name: evt.name || `${awayComp?.team?.name} at ${homeComp?.team?.name}`,
          shortName: evt.shortName || evt.name,
          status: statusState === 'in' ? 'In Progress' : statusState === 'post' ? 'Final' : 'Scheduled',
          statusDetail: evt.status?.type?.detail || evt.status?.type?.shortDetail || '',
          isLive: statusState === 'in',
          homeTeam: {
            name: homeComp?.team?.displayName || homeComp?.team?.name || 'Home',
            abbreviation: homeComp?.team?.abbreviation || '',
            logo: homeComp?.team?.logo || '',
            score: homeComp?.score ?? '0',
            isWinner: homeComp?.winner
          },
          awayTeam: {
            name: awayComp?.team?.displayName || awayComp?.team?.name || 'Away',
            abbreviation: awayComp?.team?.abbreviation || '',
            logo: awayComp?.team?.logo || '',
            score: awayComp?.score ?? '0',
            isWinner: awayComp?.winner
          }
        };
      });
    } catch (err) {
      console.error('Error fetching sports scores:', err);
      return [];
    }
  };

  const { data: articles, isLoading: isLoadingArticles, isError: isErrorArticles, refetch: refetchArticles } = useQuery<Article[]>({
    queryKey: ['news-feed', activeTab, city, state],
    queryFn: () => fetchNewsForTab(activeTab, city, state),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab !== 'scores' && !!city && !!state,
  });

  const { data: scores, isLoading: isLoadingScores, isError: isErrorScores, refetch: refetchScores } = useQuery<ScoreGame[]>({
    queryKey: ['sports-scores', activeSport],
    queryFn: () => fetchScoresForSport(activeSport),
    staleTime: 60 * 1000, // refresh every minute
    enabled: activeTab === 'scores',
  });

  const timeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  const handleRefresh = () => {
    if (activeTab === 'scores') refetchScores();
    else refetchArticles();
  };

  return (
    <div className="h-full w-full overflow-y-auto p-4 lg:p-6 space-y-6 text-white pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Newspaper className="w-7 h-7 text-red-500 animate-pulse shrink-0" />
            <h1 className="text-xl lg:text-2xl font-black tracking-wide uppercase bg-gradient-to-r from-white via-white/90 to-red-400 bg-clip-text text-transparent truncate">
              News &amp; Sports
            </h1>
          </div>
          <p className="text-[11px] text-white/50 mt-0.5 font-mono truncate">
            Coverage for <strong className="text-amber-400">{city}, {state}</strong> &amp; live sports scores
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className="self-start sm:self-auto p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white transition-all cursor-pointer flex items-center gap-2 text-xs font-medium"
          title="Refresh Feed"
        >
          <RefreshCw className={`w-4 h-4 ${(isLoadingArticles || isLoadingScores) ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Tabs Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab('local')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'local' ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Local ({city})</span>
        </button>

        <button
          onClick={() => setActiveTab('regional')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'regional' ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Regional ({state})</span>
        </button>

        <button
          onClick={() => setActiveTab('national')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'national' ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <Flag className="w-3.5 h-3.5" />
          <span>National (US)</span>
        </button>

        <button
          onClick={() => setActiveTab('world')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'world' ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>World</span>
        </button>

        <button
          onClick={() => setActiveTab('sports')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'sports' ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>Sports News</span>
        </button>

        <button
          onClick={() => setActiveTab('scores')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'scores' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 font-black' : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Sports Scores 🏆</span>
        </button>
      </div>

      {/* Sub-tabs for Sports Scores */}
      {activeTab === 'scores' && (
        <div className="flex flex-wrap items-center gap-2 bg-black/40 p-2 border border-white/10 rounded-2xl">
          <button
            onClick={() => setActiveSport('nfl')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSport === 'nfl' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            🏈 NFL
          </button>
          <button
            onClick={() => setActiveSport('nba')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSport === 'nba' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            🏀 NBA
          </button>
          <button
            onClick={() => setActiveSport('mlb')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSport === 'mlb' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            ⚾ MLB
          </button>
          <button
            onClick={() => setActiveSport('nhl')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSport === 'nhl' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            🏒 NHL
          </button>
          <button
            onClick={() => setActiveSport('ncaa_football')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSport === 'ncaa_football' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            🏈 NCAAF
          </button>
          <button
            onClick={() => setActiveSport('ncaa_basketball')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSport === 'ncaa_basketball' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            🏀 NCAAB
          </button>
          <button
            onClick={() => setActiveSport('soccer')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSport === 'soccer' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            ⚽ Soccer (MLS)
          </button>
        </div>
      )}

      {/* Rendering for Sports Scores Tab */}
      {activeTab === 'scores' ? (
        isLoadingScores ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-40 bg-white/[0.03] border border-white/5 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : isErrorScores ? (
          <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <h3 className="text-base font-bold text-white">Failed to load live sports scores</h3>
            <p className="text-xs text-white/60">Please try again or select another sport league.</p>
          </div>
        ) : !scores || scores.length === 0 ? (
          <div className="bg-white/5 border border-white/5 rounded-2xl p-8 text-center space-y-3">
            <Activity className="w-8 h-8 text-white/30 mx-auto" />
            <h3 className="text-base font-bold text-white">No games scheduled today</h3>
            <p className="text-xs text-white/50">There are no live or upcoming games listed for this league right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scores.map((game) => (
              <div
                key={game.id}
                className="bg-black/50 border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl hover:border-amber-500/40 transition-all flex flex-col justify-between"
              >
                {/* Game Status Badge */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-extrabold uppercase tracking-wider ${
                    game.isLive
                      ? 'bg-red-600 text-white animate-pulse'
                      : game.status === 'Final'
                      ? 'bg-white/10 text-white/60'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {game.isLive ? '• LIVE' : game.status}
                  </span>
                  <span className="text-xs font-mono text-white/60">{game.statusDetail}</span>
                </div>

                {/* Teams & Scores */}
                <div className="space-y-3">
                  {/* Away Team */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {game.awayTeam.logo ? (
                        <img src={game.awayTeam.logo} alt={game.awayTeam.name} className="w-8 h-8 object-contain shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">{game.awayTeam.abbreviation}</div>
                      )}
                      <span className={`text-sm font-bold truncate ${game.awayTeam.isWinner ? 'text-amber-400 font-extrabold' : 'text-white'}`}>
                        {game.awayTeam.name}
                      </span>
                    </div>
                    <span className={`text-xl font-mono font-black shrink-0 ${game.awayTeam.isWinner ? 'text-amber-400' : 'text-white'}`}>
                      {game.awayTeam.score}
                    </span>
                  </div>

                  {/* Home Team */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {game.homeTeam.logo ? (
                        <img src={game.homeTeam.logo} alt={game.homeTeam.name} className="w-8 h-8 object-contain shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">{game.homeTeam.abbreviation}</div>
                      )}
                      <span className={`text-sm font-bold truncate ${game.homeTeam.isWinner ? 'text-amber-400 font-extrabold' : 'text-white'}`}>
                        {game.homeTeam.name}
                      </span>
                    </div>
                    <span className={`text-xl font-mono font-black shrink-0 ${game.homeTeam.isWinner ? 'text-amber-400' : 'text-white'}`}>
                      {game.homeTeam.score}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* News Articles Grid */
        isLoadingArticles ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-96 bg-white/[0.03] border border-white/5 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : isErrorArticles ? (
          <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <h3 className="text-base font-bold text-white">Failed to load news articles</h3>
            <p className="text-xs text-white/60">
              Please ensure you have configured a valid NewsAPI.org or GNews API key in Admin Settings.
            </p>
          </div>
        ) : !articles || articles.length === 0 ? (
          <div className="bg-white/5 border border-white/5 rounded-2xl p-8 text-center space-y-3">
            <Newspaper className="w-8 h-8 text-white/30 mx-auto" />
            <h3 className="text-base font-bold text-white">No articles found</h3>
            <p className="text-xs text-white/50">
              No news items matched this topic right now. Make sure API keys are configured in Settings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {articles.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-black/40 border border-white/10 hover:border-red-500/50 rounded-2xl overflow-hidden flex flex-col justify-between transition-all hover:scale-[1.01] hover:shadow-xl group"
              >
                <div>
                  {item.imageUrl ? (
                    <div className="h-64 sm:h-72 w-full overflow-hidden bg-slate-900 relative">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : null}

                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-white/50 font-mono">
                      <span className="font-bold text-amber-400 truncate max-w-[160px]">{item.source}</span>
                      <span>{timeAgo(item.publishedAt)}</span>
                    </div>

                    <h2 className="text-base font-bold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
                      {item.title}
                    </h2>

                    {item.description && (
                      <p className="text-xs text-white/60 line-clamp-3 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-5 pt-0 flex items-center justify-between text-xs font-bold text-red-400 border-t border-white/5 mt-3">
                  <span className="text-[10px] px-2.5 py-1 rounded bg-white/5 text-white/40 font-mono">
                    {item.apiSource}
                  </span>
                  <div className="flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                    <span>Read Article</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )
      )}
    </div>
  );
}

