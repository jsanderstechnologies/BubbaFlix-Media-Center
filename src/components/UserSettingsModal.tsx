import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Settings2 } from 'lucide-react';
import SpatialNavigation from 'spatial-navigation-js';

import { useSettings } from '../lib/settings';

interface UserSettingsModalProps {
  onClose: () => void;
}

export function UserSettingsModal({ onClose, userId }: UserSettingsModalProps & { userId?: string }) {
  const { userSettings, zoom, updateUserSettings, updateZoom } = useSettings();
  
  const [settings, setSettings] = useState(userSettings);
  const [localZoom, setLocalZoom] = useState(zoom);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ensure focus stays within the modal for all navigation keys
      if (modalRef.current && !modalRef.current.contains(document.activeElement)) {
        const firstFocusable = modalRef.current.querySelector('.focusable, button, input, select') as HTMLElement;
        if (firstFocusable) firstFocusable.focus();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  useEffect(() => {
    setSettings(userSettings);
    setLocalZoom(zoom);
  }, [userSettings, zoom]);

  useEffect(() => {
    SpatialNavigation.add('settings-modal', {
      selector: '#user-settings-modal .focusable, #user-settings-modal button, #user-settings-modal input, #user-settings-modal select, #user-settings-modal [tabindex="0"]',
      restrict: 'self-only',
      enterTo: 'last-focused',
      straightOnly: false
    });

    const focusTimeout = setTimeout(() => {
      SpatialNavigation.disable('');
      SpatialNavigation.disable('media-modal');
      SpatialNavigation.disable('auth-modal');
      SpatialNavigation.disable('auth-dropdown');
      SpatialNavigation.makeFocusable('settings-modal');
      SpatialNavigation.focus('settings-modal');

      // Auto-focus first input/button inside modal
      if (modalRef.current) {
        const firstElement = modalRef.current.querySelector('.focusable, button, input, select') as HTMLElement;
        if (firstElement) firstElement.focus();
      }
    }, 50);

    return () => {
      clearTimeout(focusTimeout);
      SpatialNavigation.remove('settings-modal');
      const hasMediaModal = document.getElementById('media-modal') && !document.getElementById('media-modal')?.classList.contains('hidden');
      if (hasMediaModal) {
        SpatialNavigation.enable('media-modal');
        SpatialNavigation.focus('media-modal');
      } else {
        SpatialNavigation.enable('');
        SpatialNavigation.focus('');
      }
    };
  }, []);

  const handleSave = () => {
    updateUserSettings(settings);
    updateZoom(localZoom);
    window.dispatchEvent(new Event('userSettingsChanged'));
    onClose();
  };

  const toggleResolution = (res: string) => {
    setSettings(prev => ({
      ...prev,
      resolutions: prev.resolutions.includes(res)
        ? prev.resolutions.filter(r => r !== res)
        : [...prev.resolutions, res]
    }));
  };

  const handleFocusCapture = (e: React.FocusEvent) => {
    if (e.target && typeof (e.target as HTMLElement).scrollIntoView === 'function') {
      (e.target as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  return createPortal(
    <div 
      id="user-settings-modal" 
      ref={modalRef} 
      className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div 
        className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Playback Settings</h2>
              <p className="text-white/50 text-sm">Customize your streaming experience</p>
            </div>
          </div>
          <button 
            type="button"
            tabIndex={0}
            onClick={onClose}
            className="focusable p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors focus:bg-white/20 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div 
          className="p-6 overflow-y-auto space-y-8 flex-1"
          onFocusCapture={handleFocusCapture}
        >
          {/* Zoom Setting */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Display Options</h3>
            <div className="space-y-2">
              <label className="text-xs text-white/50 block">Screen Zoom Level ({localZoom}x)</label>
              <input 
                type="range" 
                min="0.5" 
                max="2.0" 
                step="0.1" 
                value={localZoom}
                onChange={e => setLocalZoom(parseFloat(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    e.stopPropagation();
                    setLocalZoom(z => Math.max(0.5, Number((z - 0.1).toFixed(1))));
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    setLocalZoom(z => Math.min(2.0, Number((z + 0.1).toFixed(1))));
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    const focusables = Array.from(modalRef.current?.querySelectorAll('.focusable, button, input, select') || []);
                    const idx = focusables.indexOf(e.currentTarget);
                    if (idx >= 0 && idx < focusables.length - 1) {
                      (focusables[idx + 1] as HTMLElement).focus();
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    const focusables = Array.from(modalRef.current?.querySelectorAll('.focusable, button, input, select') || []);
                    const idx = focusables.indexOf(e.currentTarget);
                    if (idx > 0) {
                      (focusables[idx - 1] as HTMLElement).focus();
                    }
                  }
                }}
                className="focusable w-full accent-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-zinc-900 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-white/40">
                <span>Smaller</span>
                <span>Default</span>
                <span>Larger</span>
              </div>
            </div>
          </div>

          {/* Resolutions */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Stream Resolutions</h3>
            <p className="text-xs text-white/40 leading-relaxed mb-4">Select which video qualities you want to see in the stream results.</p>
            <div className="flex gap-3">
              {['4K', '1080p', '720p'].map(res => (
                <button 
                  key={res}
                  type="button"
                  tabIndex={0}
                  onClick={() => toggleResolution(res)}
                  className={`focusable flex-1 flex items-center justify-center p-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-emerald-500/20 ${
                    settings.resolutions?.includes(res) 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                      : 'bg-black/50 border-white/5 text-white/40 hover:border-white/20'
                  }`}
                >
                  <span className="font-bold">{res}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Languages */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Language Preferences</h3>
            
            <div className="space-y-2">
              <label className="text-xs text-white/50 block">Preferred Audio Language (e.g. eng, spa, fre)</label>
              <input 
                type="text" 
                value={settings.audioLanguage}
                onChange={e => setSettings({...settings, audioLanguage: e.target.value.toLowerCase()})}
                className="focusable w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400 focus:bg-black/80 outline-none transition-all"
                placeholder="eng"
              />
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs text-white/50 block">Preferred Subtitle Language (e.g. eng, spa)</label>
              <input 
                type="text" 
                value={settings.ccLanguage}
                onChange={e => setSettings({...settings, ccLanguage: e.target.value.toLowerCase()})}
                className="focusable w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400 focus:bg-black/80 outline-none transition-all"
                placeholder="eng"
              />
            </div>
          </div>

          {/* Weather Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Weather Location</h3>
            
            <div className="space-y-2">
              <label className="text-xs text-white/50 block">Default City Name or ZIP Code (e.g. 78701, Chicago)</label>
              <input 
                type="text" 
                value={settings.weatherLocation || ''}
                onChange={e => setSettings({...settings, weatherLocation: e.target.value})}
                className="focusable w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400 focus:bg-black/80 outline-none transition-all"
                placeholder="e.g. Chicago, IL or 60601"
              />
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-xs text-white/50 block">Temperature Unit</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  tabIndex={0}
                  onClick={() => setSettings({...settings, temperatureUnit: 'F'})}
                  className={`focusable flex-1 py-2.5 rounded-xl border text-xs font-bold font-mono transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-emerald-500/20 ${settings.temperatureUnit === 'F' || !settings.temperatureUnit ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-black/40 border-white/10 text-white/40'}`}
                >
                  Fahrenheit (°F)
                </button>
                <button
                  type="button"
                  tabIndex={0}
                  onClick={() => setSettings({...settings, temperatureUnit: 'C'})}
                  className={`focusable flex-1 py-2.5 rounded-xl border text-xs font-bold font-mono transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-emerald-500/20 ${settings.temperatureUnit === 'C' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-black/40 border-white/10 text-white/40'}`}
                >
                  Celsius (°C)
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs text-white/50 block">Media Playback Weather Alert Interruption Level</label>
              <select
                tabIndex={0}
                value={settings.weatherAlertInterruptLevel || 'Severe'}
                onChange={e => setSettings({...settings, weatherAlertInterruptLevel: e.target.value as any})}
                className="focusable w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400 focus:bg-black/80 outline-none transition-all cursor-pointer"
              >
                <option value="Extreme" className="bg-slate-900 text-white">🚨 Extreme Only (Life-threatening emergencies, Tornado Warnings)</option>
                <option value="Severe" className="bg-slate-900 text-white">⚠️ Severe &amp; Extreme (Severe Thunderstorm, Blizzard, Tornado Warnings)</option>
                <option value="Moderate" className="bg-slate-900 text-white">📢 Moderate &amp; Above (Includes Storm Watches &amp; Advisories)</option>
                <option value="Minor" className="bg-slate-900 text-white">ℹ️ All Active Alerts (Includes Minor Advisories &amp; Statements)</option>
                <option value="None" className="bg-slate-900 text-white">🚫 Disable Media Interruptions (Do not interrupt streaming)</option>
              </select>
              <p className="text-[11px] text-white/40 leading-normal">
                Select the minimum alert severity required to pause or interrupt streaming media when weather alerts occur.
              </p>
            </div>
          </div>

          {/* Playback Options */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Playback Options</h3>
            <button 
              type="button"
              tabIndex={0}
              onClick={() => setSettings({...settings, autoCC: !settings.autoCC})}
              className="focusable w-full flex items-center justify-between gap-4 p-4 bg-black/50 border border-white/5 rounded-xl cursor-pointer hover:border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-emerald-500/20 text-left"
            >
              <div className="flex-1 pr-2">
                <div className="text-sm font-medium text-white">Auto-enable Subtitles</div>
                <div className="text-xs text-white/40 mt-1">Automatically turn on CC when playing a video</div>
              </div>
              <div className={`shrink-0 w-10 h-6 rounded-full p-1 transition-colors ${settings.autoCC ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.autoCC ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </button>

            <button 
              type="button"
              tabIndex={0}
              onClick={() => setSettings({...settings, autoSkipIntros: !settings.autoSkipIntros})}
              className="focusable w-full flex items-center justify-between gap-4 p-4 bg-black/50 border border-white/5 rounded-xl cursor-pointer hover:border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-emerald-500/20 text-left"
            >
              <div className="flex-1 pr-2">
                <div className="text-sm font-medium text-white">Auto-Skip Intros & Recaps</div>
                <div className="text-xs text-white/40 mt-1">Automatically skip TV intro/recap sequences via TheIntroDB</div>
              </div>
              <div className={`shrink-0 w-10 h-6 rounded-full p-1 transition-colors ${settings.autoSkipIntros ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.autoSkipIntros ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </button>

            <button 
              type="button"
              tabIndex={0}
              onClick={() => setSettings({...settings, autoSkipCredits: !settings.autoSkipCredits})}
              className="focusable w-full flex items-center justify-between gap-4 p-4 bg-black/50 border border-white/5 rounded-xl cursor-pointer hover:border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-emerald-500/20 text-left"
            >
              <div className="flex-1 pr-2">
                <div className="text-sm font-medium text-white">Auto-Skip End Credits</div>
                <div className="text-xs text-white/40 mt-1">Automatically skip end credits on movies and TV shows via TheIntroDB</div>
              </div>
              <div className={`shrink-0 w-10 h-6 rounded-full p-1 transition-colors ${settings.autoSkipCredits ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.autoSkipCredits ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </button>

            <button 
              type="button"
              tabIndex={0}
              onClick={() => setSettings({...settings, enableAudioLeveling: !settings.enableAudioLeveling})}
              className="focusable w-full flex items-center justify-between gap-4 p-4 bg-black/50 border border-white/5 rounded-xl cursor-pointer hover:border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-emerald-500/20 text-left"
            >
              <div className="flex-1 pr-2">
                <div className="text-sm font-medium text-white">Dynamic Audio Leveling</div>
                <div className="text-xs text-white/40 mt-1">Normalize video volume dynamically to prevent loud effects from overwhelming dialogues.</div>
              </div>
              <div className={`shrink-0 w-10 h-6 rounded-full p-1 transition-colors ${settings.enableAudioLeveling ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.enableAudioLeveling ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </button>
          </div>
          
        </div>

        <div className="p-6 border-t border-white/10 shrink-0">
          <button 
            type="button"
            tabIndex={0}
            onClick={handleSave}
            className="focusable w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-3 px-4 rounded-xl hover:bg-white/90 transition-colors focus:outline-none focus:ring-4 focus:ring-emerald-500/50"
          >
            <Save className="w-5 h-5" />
            Save Preferences
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
