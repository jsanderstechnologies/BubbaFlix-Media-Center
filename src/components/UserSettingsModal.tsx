import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Settings2 } from 'lucide-react';
import SpatialNavigation from 'spatial-navigation-js';

import { useSettings } from '../lib/settings';

// Removed exported interfaces since they are now in lib/settings

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
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === document.body) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || document.activeElement === document.body) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setSettings(userSettings);
    setLocalZoom(zoom);
  }, [userSettings, zoom]);

  useEffect(() => {
    let focusTimeout: any;
    
    SpatialNavigation.add('settings-modal', {
      selector: '#user-settings-modal .focusable, #user-settings-modal button, #user-settings-modal input, #user-settings-modal select, #user-settings-modal [tabindex="0"]',
      restrict: 'self-only',
      enterTo: 'last-focused'
    });
    
    // Slight delay to ensure portal is rendered and layout calculated
    focusTimeout = setTimeout(() => {
      SpatialNavigation.makeFocusable('settings-modal');
      SpatialNavigation.focus('settings-modal');
      SpatialNavigation.disable('auth-dropdown');
      SpatialNavigation.disable(''); // Disable background
    }, 50);

    return () => {
      clearTimeout(focusTimeout);
      document.removeEventListener('keydown', handleKeyDown);
      SpatialNavigation.remove('settings-modal');
      SpatialNavigation.enable('auth-dropdown');
      SpatialNavigation.focus('auth-dropdown');
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

  return createPortal(
    <div id="user-settings-modal" ref={modalRef} className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
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
            tabIndex={0}
            onClick={onClose}
            className="focusable p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors focus:bg-white/20 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8 flex-1">
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
                  }
                }}
                className="focusable w-full accent-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 rounded-lg"
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
                <label key={res} className="flex-1 cursor-pointer group">
                  <div 
                    tabIndex={0}
                    onClick={() => toggleResolution(res)}
                    className={`focusable flex items-center justify-center p-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                    settings.resolutions?.includes(res) 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                      : 'bg-black/50 border-white/5 text-white/40 group-hover:border-white/20'
                  }`}>
                    <span className="font-bold">{res}</span>
                  </div>
                </label>
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
                className="focusable w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none"
                placeholder="eng"
              />
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs text-white/50 block">Preferred Subtitle Language (e.g. eng, spa)</label>
              <input 
                type="text" 
                value={settings.ccLanguage}
                onChange={e => setSettings({...settings, ccLanguage: e.target.value.toLowerCase()})}
                className="focusable w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none"
                placeholder="eng"
              />
            </div>
          </div>

          {/* Auto CC */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Playback Options</h3>
            <div 
              tabIndex={0}
              onClick={() => setSettings({...settings, autoCC: !settings.autoCC})}
              className="focusable flex items-center justify-between gap-4 p-4 bg-black/50 border border-white/5 rounded-xl cursor-pointer hover:border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <div className="flex-1 pr-2">
                <div className="text-sm font-medium text-white">Auto-enable Subtitles</div>
                <div className="text-xs text-white/40 mt-1">Automatically turn on CC when playing a video</div>
              </div>
              <div className={`shrink-0 w-10 h-6 rounded-full p-1 transition-colors ${settings.autoCC ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.autoCC ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>

            <div 
              tabIndex={0}
              onClick={() => setSettings({...settings, enableAudioLeveling: !settings.enableAudioLeveling})}
              className="focusable flex items-center justify-between gap-4 p-4 bg-black/50 border border-white/5 rounded-xl cursor-pointer hover:border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <div className="flex-1 pr-2">
                <div className="text-sm font-medium text-white">Dynamic Audio Leveling</div>
                <div className="text-xs text-white/40 mt-1">Normalize video volume dynamically to prevent loud effects from overwhelming dialogues.</div>
              </div>
              <div className={`shrink-0 w-10 h-6 rounded-full p-1 transition-colors ${settings.enableAudioLeveling ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.enableAudioLeveling ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>
          </div>
          
        </div>


        <div className="p-6 border-t border-white/10 shrink-0">
          <button 
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
