import React, { useEffect, useRef } from 'react';
import { ShieldAlert, CloudSun, X, AlertTriangle, Radio, ExternalLink, Volume2 } from 'lucide-react';
import SpatialNavigation from 'spatial-navigation-js';
import { WeatherAlert, dismissAlertId } from '../lib/weatherAlerts';
import { logger } from '../lib/logger';

interface WeatherAlertModalProps {
  alert: WeatherAlert;
  onDismiss: () => void;
  onGoToWeather: () => void;
}

export default function WeatherAlertModal({ alert, onDismiss, onGoToWeather }: WeatherAlertModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logger.info("WeatherAlertModal: Displaying urgent weather alert popup to user", {
      event: alert.event,
      severity: alert.severity
    });

    // Play subtle alert chime or beep if audio context permits
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.setValueAtTime(440, audioCtx.currentTime + 0.15); // A4
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch {
      // Audio playback restricted or unsupported
    }

    // Spatial navigation lock for TV remote control D-pad
    SpatialNavigation.add('weather-alert-modal', {
      selector: '#weather-alert-modal button, #weather-alert-modal [tabindex="0"]',
      restrict: 'self-only',
      enterTo: 'last-focused'
    });
    SpatialNavigation.makeFocusable('weather-alert-modal');
    SpatialNavigation.focus('weather-alert-modal');

    // Auto-focus primary view weather button
    setTimeout(() => {
      const primaryBtn = modalRef.current?.querySelector('button') as HTMLElement;
      if (primaryBtn) primaryBtn.focus();
    }, 100);

    return () => {
      SpatialNavigation.remove('weather-alert-modal');
      SpatialNavigation.makeFocusable();
    };
  }, [alert]);

  const handleDismiss = () => {
    logger.info("WeatherAlertModal: User dismissed weather alert", { alertId: alert.id });
    dismissAlertId(alert.id);
    onDismiss();
  };

  const handleGoToWeather = () => {
    logger.info("WeatherAlertModal: User selected Go To Weather Page", { alertId: alert.id });
    dismissAlertId(alert.id);
    onGoToWeather();
  };

  const isExtreme = alert.severity === 'Extreme' || alert.event.toLowerCase().includes('tornado') || alert.event.toLowerCase().includes('warning');

  return (
    <div 
      id="weather-alert-modal"
      ref={modalRef}
      className="fixed inset-0 z-[999999] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-8 animate-in fade-in zoom-in-95 duration-200"
    >
      <div className={`w-full max-w-2xl bg-slate-900 border-2 rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(239,68,68,0.5)] flex flex-col ${isExtreme ? 'border-red-600 animate-pulse-border' : 'border-amber-500'}`}>
        
        {/* Urgent Header Bar */}
        <div className={`px-6 py-5 flex items-center justify-between border-b ${isExtreme ? 'bg-red-950/80 border-red-600/50 text-red-200' : 'bg-amber-950/80 border-amber-500/50 text-amber-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${isExtreme ? 'bg-red-600 text-white animate-bounce' : 'bg-amber-500 text-black'}`}>
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded font-mono ${isExtreme ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'}`}>
                  {alert.severity || 'SEVERE'} WEATHER ALERT
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide mt-0.5">
                {alert.event}
              </h2>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            tabIndex={0}
            className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
            title="Dismiss Alert"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[60vh] overflow-y-auto text-white custom-scrollbar">
          {/* Headline */}
          <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
            <p className="text-sm font-semibold text-amber-300 leading-relaxed">
              {alert.headline || alert.event}
            </p>
            {alert.areaDesc && (
              <p className="text-xs text-white/60 mt-2 font-mono">
                📍 <strong>Affected Areas:</strong> {alert.areaDesc}
              </p>
            )}
          </div>

          {/* Safety Instructions */}
          {alert.instruction && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl space-y-1">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider block">Safety Instructions</span>
              <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-medium">
                {alert.instruction}
              </p>
            </div>
          )}

          {/* Alert Description Details */}
          {alert.description && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-white/50 uppercase tracking-wider block">Official Statement</span>
              <p className="text-xs text-white/70 leading-relaxed font-mono whitespace-pre-line bg-black/40 p-4 rounded-2xl border border-white/5">
                {alert.description}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-6 bg-black/80 border-t border-white/10 flex flex-col sm:flex-row items-center justify-end gap-3 shrink-0">
          <button
            onClick={handleDismiss}
            tabIndex={0}
            className="w-full sm:w-auto px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
          >
            Dismiss Alert
          </button>

          <button
            onClick={handleGoToWeather}
            tabIndex={0}
            className="w-full sm:w-auto px-8 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-xl shadow-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-400 cursor-pointer"
          >
            <CloudSun className="w-5 h-5" />
            <span>View Weather & Radar Page</span>
          </button>
        </div>

      </div>
    </div>
  );
}
