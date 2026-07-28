import React, { useState, useEffect } from 'react';
import { CloudSun, Search, MapPin, Wind, Droplets, Gauge, Sun, Thermometer, Radio, ExternalLink, RefreshCw, Eye, ShieldAlert, CloudRain, Snowflake, CloudLightning, CloudFog, Maximize2, Minimize2, X } from 'lucide-react';
import { useSettings } from '../lib/settings';
import { logger } from '../lib/logger';

interface WeatherData {
  city: string;
  state?: string;
  country?: string;
  lat: number;
  lon: number;
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
    pressure: number;
    weatherCode: number;
    isDay: number;
    uvIndexMax: number;
    tempMax: number;
    tempMin: number;
  };
  hourly: Array<{
    time: string;
    temp: number;
    weatherCode: number;
    precipProb: number;
  }>;
  daily: Array<{
    date: string;
    dayName: string;
    tempMax: number;
    tempMin: number;
    weatherCode: number;
    precipProb: number;
  }>;
}

const WMO_CODE_MAP: Record<number, { label: string; icon: string }> = {
  0: { label: 'Clear Sky', icon: '☀️' },
  1: { label: 'Mainly Clear', icon: '🌤️' },
  2: { label: 'Partly Cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Foggy', icon: '🌫️' },
  48: { label: 'Depositing Rime Fog', icon: '🌫️' },
  51: { label: 'Light Drizzle', icon: '🌧️' },
  53: { label: 'Moderate Drizzle', icon: '🌧️' },
  55: { label: 'Dense Drizzle', icon: '🌧️' },
  56: { label: 'Freezing Drizzle', icon: '🌧️' },
  57: { label: 'Dense Freezing Drizzle', icon: '🌧️' },
  61: { label: 'Slight Rain', icon: '🌧️' },
  63: { label: 'Moderate Rain', icon: '🌧️' },
  65: { label: 'Heavy Rain', icon: '🌧️' },
  66: { label: 'Light Freezing Rain', icon: '🌧️' },
  67: { label: 'Heavy Freezing Rain', icon: '🌧️' },
  71: { label: 'Slight Snow', icon: '🌨️' },
  73: { label: 'Moderate Snow', icon: '🌨️' },
  75: { label: 'Heavy Snow', icon: '❄️' },
  77: { label: 'Snow Grains', icon: '❄️' },
  80: { label: 'Slight Rain Showers', icon: '🌦️' },
  81: { label: 'Moderate Rain Showers', icon: '🌧️' },
  82: { label: 'Violent Rain Showers', icon: '⛈️' },
  85: { label: 'Slight Snow Showers', icon: '🌨️' },
  86: { label: 'Heavy Snow Showers', icon: '❄️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm w/ Slight Hail', icon: '⛈️' },
  99: { label: 'Thunderstorm w/ Heavy Hail', icon: '⛈️' }
};

export default function WeatherPanel() {
  const { userSettings, updateUserSettings } = useSettings();
  
  const [locationQuery, setLocationQuery] = useState(userSettings.weatherLocation || 'Austin, TX');
  const [searchQuery, setSearchQuery] = useState('');
  const [unit, setUnit] = useState<'F' | 'C'>(userSettings.temperatureUnit || 'F');
  
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [radarProvider, setRadarProvider] = useState<'windy' | 'rainviewer' | 'ventusky' | 'meteoblue' | 'nws' | 'wunderground'>('windy');
  const [isFullScreenRadar, setIsFullScreenRadar] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreenRadar) {
        logger.info("Weather: Exit fullscreen radar via Escape key");
        setIsFullScreenRadar(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreenRadar]);

  useEffect(() => {
    if (userSettings.weatherLocation) {
      setLocationQuery(userSettings.weatherLocation);
    }
  }, [userSettings.weatherLocation]);

  const handleSetRadarProvider = (provider: 'windy' | 'rainviewer' | 'ventusky' | 'meteoblue' | 'nws' | 'wunderground') => {
    logger.info("Weather: Changed radar provider", { provider });
    setRadarProvider(provider);
  };

  const handleToggleFullScreenRadar = (enabled: boolean) => {
    logger.info("Weather: Toggled fullscreen radar mode", { enabled });
    setIsFullScreenRadar(enabled);
  };

  const fetchWeather = async (locStr: string) => {
    if (!locStr || locStr.trim().length === 0) return;
    setLoading(true);
    setError(null);
    logger.info("Weather: Fetching weather conditions", { location: locStr, unit });

    try {
      let lat: number | null = null;
      let lon: number | null = null;
      let cityName = locStr.trim();
      let stateName = '';
      let countryName = '';

      const isZip = /^\d{5}(-\d{4})?$/.test(locStr.trim());

      if (isZip) {
        const zipRes = await fetch(`https://api.zippopotam.us/us/${locStr.trim()}`).then(r => r.json()).catch(() => null);
        if (zipRes && zipRes.places?.[0]) {
          lat = parseFloat(zipRes.places[0].latitude);
          lon = parseFloat(zipRes.places[0].longitude);
          cityName = zipRes.places[0]['place name'];
          stateName = zipRes.places[0]['state abbreviation'];
          countryName = zipRes['country abbreviation'] || 'US';
        }
      }

      if (lat === null || lon === null) {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locStr.trim())}&count=1&language=en&format=json`).then(r => r.json()).catch(() => null);
        if (geoRes && geoRes.results?.[0]) {
          const res = geoRes.results[0];
          lat = res.latitude;
          lon = res.longitude;
          cityName = res.name;
          stateName = res.admin1 || '';
          countryName = res.country_code || res.country || '';
        }
      }

      if (lat === null || lon === null) {
        const errMsg = `Could not locate "${locStr}". Please check city name or ZIP code.`;
        setError(errMsg);
        logger.warn("Weather: Location geocoding failed", { location: locStr });
        setLoading(false);
        return;
      }

      const tempUnitParam = unit === 'F' ? 'fahrenheit' : 'celsius';
      const windUnitParam = unit === 'F' ? 'mph' : 'kmh';
      
      const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&temperature_unit=${tempUnitParam}&wind_speed_unit=${windUnitParam}&precipitation_unit=inch&timezone=auto`;

      const data = await fetch(weatherApiUrl).then(r => r.json());

      if (!data || !data.current) {
        setError('Failed to load weather forecast data.');
        logger.error("Weather: Failed to parse forecast payload", { location: locStr });
        setLoading(false);
        return;
      }

      const curr = data.current;
      const hourlyList = (data.hourly?.time || []).slice(0, 24).map((timeStr: string, idx: number) => {
        const d = new Date(timeStr);
        const hours = d.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHour = (hours % 12 || 12) + ' ' + ampm;
        return {
          time: formattedHour,
          temp: Math.round(data.hourly.temperature_2m[idx]),
          weatherCode: data.hourly.weather_code[idx],
          precipProb: data.hourly.precipitation_probability ? data.hourly.precipitation_probability[idx] : 0
        };
      });

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dailyList = (data.daily?.time || []).slice(0, 7).map((dateStr: string, idx: number) => {
        const d = new Date(dateStr + 'T00:00:00');
        return {
          date: dateStr,
          dayName: idx === 0 ? 'Today' : dayNames[d.getDay()],
          tempMax: Math.round(data.daily.temperature_2m_max[idx]),
          tempMin: Math.round(data.daily.temperature_2m_min[idx]),
          weatherCode: data.daily.weather_code[idx],
          precipProb: 0
        };
      });

      setWeather({
        city: cityName,
        state: stateName,
        country: countryName,
        lat,
        lon,
        current: {
          temp: Math.round(curr.temperature_2m),
          feelsLike: Math.round(curr.apparent_temperature),
          humidity: curr.relative_humidity_2m,
          windSpeed: Math.round(curr.wind_speed_10m),
          windDirection: curr.wind_direction_10m,
          pressure: Math.round(curr.pressure_msl),
          weatherCode: curr.weather_code,
          isDay: curr.is_day,
          uvIndexMax: data.daily?.uv_index_max?.[0] ? Math.round(data.daily.uv_index_max[0]) : 0,
          tempMax: Math.round(data.daily?.temperature_2m_max?.[0] || curr.temperature_2m),
          tempMin: Math.round(data.daily?.temperature_2m_min?.[0] || curr.temperature_2m)
        },
        hourly: hourlyList,
        daily: dailyList
      });

      logger.info("Weather: Successfully loaded forecast", {
        city: cityName,
        state: stateName,
        temp: Math.round(curr.temperature_2m),
        condition: WMO_CODE_MAP[curr.weather_code]?.label || 'Clear'
      });

    } catch (e: any) {
      console.error('Weather fetch error:', e);
      setError('Network error fetching weather data.');
      logger.error("Weather: Exception during fetchWeather", { location: locStr, error: e?.message || e });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather(locationQuery);
  }, [locationQuery, unit]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const newLoc = searchQuery.trim();
      logger.info("Weather: User submitted new location search", { query: newLoc });
      setLocationQuery(newLoc);
      updateUserSettings({ ...userSettings, weatherLocation: newLoc });
      setSearchQuery('');
    }
  };

  const toggleUnit = () => {
    const newUnit = unit === 'F' ? 'C' : 'F';
    logger.info("Weather: Toggled temperature unit", { newUnit });
    setUnit(newUnit);
    updateUserSettings({ ...userSettings, temperatureUnit: newUnit });
  };

  const getWindDirectionStr = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
  };

  const getNwsRadarUrl = (lat: number, lon: number) => {
    const settingsObj = { lat, lng: lon, zoom: 8, animating: true };
    const b64 = btoa(JSON.stringify(settingsObj));
    return `https://radar.weather.gov/?settings=v1_${b64}#/`;
  };

  const getRadarIframeUrl = () => {
    if (!weather) return 'https://embed.windy.com/';
    if (radarProvider === 'rainviewer') {
      return `https://www.rainviewer.com/map.html?loc=${weather.lat},${weather.lon},8&o=90&c=1&oCloud=0&p=1&m=1&col=1&theme=1&sm=1&sn=1`;
    }
    if (radarProvider === 'ventusky') {
      return `https://www.ventusky.com/?p=${weather.lat};${weather.lon};8&l=radar`;
    }
    if (radarProvider === 'meteoblue') {
      return `https://www.meteoblue.com/en/weather/maps/widget/${encodeURIComponent(weather.city)}?windAnimation=1&gust=0&satellite=1&cloudsAndPrecipitation=1&celsius=0&domain=NMM`;
    }
    if (radarProvider === 'nws') {
      return getNwsRadarUrl(weather.lat, weather.lon);
    }
    if (radarProvider === 'wunderground') {
      return `https://www.wunderground.com/wundermap?lat=${weather.lat}&lon=${weather.lon}&zoom=8&radar=1`;
    }
    return `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=%C2%B0F&radarRange=-1&overlay=radar&product=radar&level=surface&lat=${weather.lat}&lon=${weather.lon}&zoom=8`;
  };

  return (
    <div className="min-h-full p-6 sm:p-8 space-y-8 max-w-7xl mx-auto pb-24 text-white">
      {/* Fullscreen Radar Modal */}
      {isFullScreenRadar && weather && (
        <div className="fixed top-20 left-20 right-0 bottom-0 z-40 bg-black flex flex-col border-t border-l border-white/10 shadow-2xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <Radio className="w-5 h-5 text-red-500 animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                Live Interactive Weather Radar - {weather.city}{weather.state ? `, ${weather.state}` : ''}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex bg-black/60 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => handleSetRadarProvider('windy')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${radarProvider === 'windy' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white'}`}
                >
                  Windy
                </button>
                <button
                  onClick={() => handleSetRadarProvider('rainviewer')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${radarProvider === 'rainviewer' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white'}`}
                >
                  RainViewer
                </button>
                <button
                  onClick={() => handleSetRadarProvider('ventusky')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${radarProvider === 'ventusky' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white'}`}
                >
                  Ventusky
                </button>
                <button
                  onClick={() => handleSetRadarProvider('meteoblue')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${radarProvider === 'meteoblue' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white'}`}
                >
                  Meteoblue
                </button>
                <button
                  onClick={() => handleSetRadarProvider('nws')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${radarProvider === 'nws' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white'}`}
                >
                  NOAA NWS Radar
                </button>
                <button
                  onClick={() => handleSetRadarProvider('wunderground')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${radarProvider === 'wunderground' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white'}`}
                >
                  Weather Underground
                </button>
              </div>

              <button
                onClick={() => handleToggleFullScreenRadar(false)}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg ml-2"
              >
                <Minimize2 className="w-4 h-4" />
                <span>Exit Fullscreen (Esc)</span>
              </button>
            </div>
          </div>

          <div className="flex-1 w-full h-full relative bg-black">
            <iframe
              title="Fullscreen Live Weather Radar"
              src={getRadarIframeUrl()}
              className="w-full h-full border-0"
              allow="geolocation"
            />
          </div>
        </div>
      )}

      {/* Header & Location Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <CloudSun className="w-8 h-8 text-amber-400 animate-pulse" />
            <h1 className="text-2xl sm:text-3xl font-black tracking-wide uppercase bg-gradient-to-r from-white via-white/90 to-amber-300 bg-clip-text text-transparent">
              Weather & Radar
            </h1>
          </div>
          <p className="text-xs text-white/50 mt-1 font-mono">
            Real-time conditions, multi-day forecasts & live animated weather radar loops
          </p>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-80">
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search City or ZIP Code (e.g. 78701, Chicago)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-10 text-xs sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
            />
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
          </form>

          <button
            onClick={toggleUnit}
            className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer text-amber-400"
            title="Toggle Temperature Unit (°F / °C)"
          >
            °{unit}
          </button>

          <button
            onClick={() => fetchWeather(locationQuery)}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white transition-all cursor-pointer"
            title="Refresh Weather"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !weather && (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="w-12 h-12 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <p className="text-xs font-mono uppercase tracking-widest text-white/60">Fetching weather data...</p>
        </div>
      )}

      {error && (
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {weather && (
        <>
          {/* Main Weather Hero Card */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-black/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <h2 className="text-xl sm:text-2xl font-bold tracking-wide text-white">
                    {weather.city}{weather.state ? `, ${weather.state}` : ''} {weather.country ? `(${weather.country})` : ''}
                  </h2>
                </div>

                <div className="flex items-baseline gap-4">
                  <span className="text-6xl sm:text-7xl font-black text-white tracking-tighter">
                    {weather.current.temp}°
                  </span>
                  <div className="space-y-1">
                    <span className="text-3xl">
                      {WMO_CODE_MAP[weather.current.weatherCode]?.icon || '🌤️'}
                    </span>
                    <div className="text-base font-bold text-amber-300">
                      {WMO_CODE_MAP[weather.current.weatherCode]?.label || 'Clear'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-white/70 font-medium">
                  <span>Feels like <strong className="text-white font-bold">{weather.current.feelsLike}°</strong></span>
                  <span>•</span>
                  <span>High <strong className="text-red-400 font-bold">{weather.current.tempMax}°</strong> / Low <strong className="text-blue-400 font-bold">{weather.current.tempMin}°</strong></span>
                </div>
              </div>

              {/* Grid of Weather Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t lg:border-t-0 lg:border-l border-white/10 pt-6 lg:pt-0 lg:pl-8">
                <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-white/50 text-[11px] font-bold uppercase">
                    <Droplets className="w-3.5 h-3.5 text-blue-400" />
                    <span>Humidity</span>
                  </div>
                  <span className="text-lg font-bold text-white mt-2 font-mono">{weather.current.humidity}%</span>
                </div>

                <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-white/50 text-[11px] font-bold uppercase">
                    <Wind className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Wind</span>
                  </div>
                  <span className="text-lg font-bold text-white mt-2 font-mono">
                    {weather.current.windSpeed} {unit === 'F' ? 'mph' : 'km/h'} {getWindDirectionStr(weather.current.windDirection)}
                  </span>
                </div>

                <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-white/50 text-[11px] font-bold uppercase">
                    <Gauge className="w-3.5 h-3.5 text-purple-400" />
                    <span>Pressure</span>
                  </div>
                  <span className="text-lg font-bold text-white mt-2 font-mono">{weather.current.pressure} hPa</span>
                </div>

                <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-white/50 text-[11px] font-bold uppercase">
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>UV Index</span>
                  </div>
                  <span className="text-lg font-bold text-white mt-2 font-mono">{weather.current.uvIndexMax}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hourly Forecast Horizontal Scroll */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
              <span>24-Hour Hourly Forecast</span>
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/20">
              {weather.hourly.map((hour, idx) => (
                <div 
                  key={idx} 
                  className="flex flex-col items-center justify-between min-w-[5rem] p-3.5 bg-white/[0.03] border border-white/5 hover:border-amber-500/40 rounded-2xl transition-all"
                >
                  <span className="text-[11px] font-medium text-white/60">{hour.time}</span>
                  <span className="text-2xl my-2">{WMO_CODE_MAP[hour.weatherCode]?.icon || '🌤️'}</span>
                  <span className="text-sm font-bold text-white font-mono">{hour.temp}°</span>
                  {hour.precipProb > 0 && (
                    <span className="text-[10px] text-blue-400 font-bold mt-1">💧{hour.precipProb}%</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 7-Day Forecast & Live Radar Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 7-Day Forecast */}
            <div className="space-y-3 lg:col-span-1">
              <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider">7-Day Daily Forecast</h3>
              <div className="space-y-2.5">
                {weather.daily.map((day, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between p-3.5 bg-white/[0.03] border border-white/5 hover:border-white/20 rounded-2xl transition-all"
                  >
                    <span className="text-xs font-bold text-white w-16">{day.dayName}</span>
                    <div className="flex items-center gap-2 flex-1 justify-center">
                      <span className="text-xl">{WMO_CODE_MAP[day.weatherCode]?.icon || '🌤️'}</span>
                      <span className="text-xs text-white/60 font-medium truncate max-w-[7rem]">
                        {WMO_CODE_MAP[day.weatherCode]?.label || 'Clear'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono font-bold">
                      <span className="text-red-400">{day.tempMax}°</span>
                      <span className="text-white/30">/</span>
                      <span className="text-blue-400">{day.tempMin}°</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Interactive Weather Radar & External Links */}
            <div className="space-y-3 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                  <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                  <span>Live Animated Weather Radar</span>
                </h3>
                
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap bg-white/5 p-1 rounded-xl border border-white/10">
                    <button
                      onClick={() => handleSetRadarProvider('windy')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${radarProvider === 'windy' ? 'bg-amber-500 text-black shadow' : 'text-white/60 hover:text-white'}`}
                    >
                      Windy
                    </button>
                    <button
                      onClick={() => handleSetRadarProvider('rainviewer')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${radarProvider === 'rainviewer' ? 'bg-amber-500 text-black shadow' : 'text-white/60 hover:text-white'}`}
                    >
                      RainViewer
                    </button>
                    <button
                      onClick={() => handleSetRadarProvider('ventusky')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${radarProvider === 'ventusky' ? 'bg-amber-500 text-black shadow' : 'text-white/60 hover:text-white'}`}
                    >
                      Ventusky
                    </button>
                    <button
                      onClick={() => handleSetRadarProvider('meteoblue')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${radarProvider === 'meteoblue' ? 'bg-amber-500 text-black shadow' : 'text-white/60 hover:text-white'}`}
                    >
                      Meteoblue
                    </button>
                    <button
                      onClick={() => handleSetRadarProvider('nws')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${radarProvider === 'nws' ? 'bg-amber-500 text-black shadow' : 'text-white/60 hover:text-white'}`}
                    >
                      NOAA NWS
                    </button>
                    <button
                      onClick={() => handleSetRadarProvider('wunderground')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${radarProvider === 'wunderground' ? 'bg-amber-500 text-black shadow' : 'text-white/60 hover:text-white'}`}
                    >
                      Weather Underground
                    </button>
                  </div>

                  <button
                    onClick={() => handleToggleFullScreenRadar(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/90 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all hover:scale-105 cursor-pointer shadow-lg border border-red-400/30"
                    title="Open Full Screen Radar Map"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Full Screen</span>
                  </button>
                </div>
              </div>



              <div className="aspect-video w-full rounded-2xl overflow-hidden border border-white/10 bg-black relative shadow-2xl group">
                <iframe
                  title="Live Interactive Weather Radar"
                  src={getRadarIframeUrl()}
                  className="w-full h-full border-0"
                  loading="lazy"
                  allow="geolocation"
                />
                
                <button
                  onClick={() => handleToggleFullScreenRadar(true)}
                  className="absolute bottom-3 right-3 px-3 py-2 bg-black/80 hover:bg-black backdrop-blur-md text-white border border-white/20 rounded-xl text-xs font-bold flex items-center gap-2 transition-all opacity-80 group-hover:opacity-100 shadow-xl cursor-pointer"
                >
                  <Maximize2 className="w-4 h-4 text-amber-400" />
                  <span>Full Screen Radar</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
