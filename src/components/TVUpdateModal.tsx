import React, { useState, useEffect } from 'react';
import SpatialNavigation from 'spatial-navigation-js';
import { Download, Tv, AlertCircle, X, ShieldAlert } from 'lucide-react';

export interface ApkInfo {
  filename: string;
  version: string;
  sizeBytes: number;
  mtime: string;
  downloadUrl: string;
}

interface TVUpdateModalProps {
  apk: ApkInfo;
  currentVersion?: string;
  onClose: () => void;
}

export default function TVUpdateModal({ apk, currentVersion = '1.0.0', onClose }: TVUpdateModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    SpatialNavigation.remove('tv-update-modal');
    SpatialNavigation.add({
      id: 'tv-update-modal',
      selector: '#tv-update-modal .focusable',
      enterTo: 'last-focused',
      defaultElement: '#btn-upgrade-now'
    });
    SpatialNavigation.focus('#tv-update-modal');

    const focusTimer = setTimeout(() => {
      const upgradeBtn = document.getElementById('btn-upgrade-now');
      if (upgradeBtn) upgradeBtn.focus();
    }, 100);

    return () => {
      clearTimeout(focusTimer);
      SpatialNavigation.remove('tv-update-modal');
    };
  }, []);

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const logEvent = (event: string, extra: any = {}) => {
    fetch('/api/system/apk/log-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        currentVersion,
        targetVersion: apk.version,
        filename: apk.filename,
        ...extra
      })
    }).catch(() => {});
  };

  const handleStartUpgrade = async () => {
    setDownloading(true);
    setProgress(0);
    setError(null);
    setDownloadStatus('Connecting to server...');
    logEvent('upgrade_started');

    try {
      // 1. Check for native Android WebView bridge interface first
      if ((window as any).Android && typeof (window as any).Android.installApk === 'function') {
        const fullUrl = `${window.location.origin}${apk.downloadUrl}`;
        (window as any).Android.installApk(fullUrl);
        setDownloadStatus('Starting native installer...');
        logEvent('upgrade_completed', { mode: 'native_bridge' });
        setTimeout(() => onClose(), 2000);
        return;
      }

      // 2. Browser / Downloader app download stream flow
      const response = await fetch(apk.downloadUrl);
      if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
      if (!response.body) throw new Error('ReadableStream not supported by client browser');

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : apk.sizeBytes;
      
      const reader = response.body.getReader();
      let receivedBytes = 0;
      const chunks: Uint8Array[] = [];

      setDownloadStatus('Downloading APK package...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          if (totalBytes > 0) {
            const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
            setProgress(pct);
          }
        }
      }

      setDownloadStatus('Preparing package installer...');
      logEvent('upgrade_completed', { mode: 'stream_download' });
      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      const blobUrl = URL.createObjectURL(blob);

      // Create download trigger element
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = apk.filename;
      document.body.appendChild(a);
      a.click();

      // Fallback direct navigate for Firestick Downloader / Silk Browser to trigger PackageInstaller
      setTimeout(() => {
        window.location.href = apk.downloadUrl;
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
      }, 1000);

    } catch (err: any) {
      console.error('[APK Upgrade Error]:', err);
      logEvent('upgrade_failed', { error: err.message });
      // Fallback direct trigger
      window.location.href = apk.downloadUrl;
    }
  };

  return (
    <div id="tv-update-modal" className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 z-[9999]">
      <div className="bg-[#121318] border border-indigo-500/30 rounded-3xl p-8 max-w-xl w-full space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-white/10 pb-5">
          <div className="p-3.5 bg-indigo-600/20 border border-indigo-500/40 rounded-2xl text-indigo-400">
            <Tv className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-wide">BubbaFlix TV Upgrade</h2>
            <p className="text-white/60 text-sm">A new version of the TV app is ready for installation.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focusable ml-auto text-white/40 hover:text-white p-2 rounded-xl focus:bg-white/20 focus:outline-none transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Version Info Card */}
        <div className="bg-black/50 border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">Version Update</span>
            <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
              {apk.filename}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-center">
              <p className="text-xs text-white/40 mb-1">Installed</p>
              <span className="text-lg font-mono font-bold text-white/70">v{currentVersion}</span>
            </div>
            <div className="text-indigo-400 font-bold text-xl">➔</div>
            <div className="text-center">
              <p className="text-xs text-indigo-300 font-semibold mb-1">New Version</p>
              <span className="text-xl font-mono font-black text-emerald-400">v{apk.version}</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40 mb-1">Package Size</p>
              <span className="text-sm font-semibold text-white/80">{formatSize(apk.sizeBytes)}</span>
            </div>
          </div>
        </div>

        {/* Notice */}
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 text-amber-300 text-xs">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>
            When installation starts, Android may prompt to confirm opening the package installer. Select <strong>Install</strong> to complete the upgrade.
          </p>
        </div>

        {/* Progress Bar (Visible during download) */}
        {downloading && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-white/70">
              <span>{downloadStatus || 'Downloading update...'}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4 pt-2">
          <button
            type="button"
            id="btn-remind-later"
            onClick={onClose}
            disabled={downloading}
            className="focusable px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold tracking-wider focus:bg-white/30 focus:scale-105 focus:outline-none transition-all cursor-pointer disabled:opacity-50"
          >
            REMIND ME LATER
          </button>

          <button
            type="button"
            id="btn-upgrade-now"
            onClick={handleStartUpgrade}
            disabled={downloading}
            className="focusable px-7 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black tracking-wider focus:bg-indigo-400 focus:scale-105 focus:shadow-lg focus:shadow-indigo-500/50 focus:outline-none transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'DOWNLOADING...' : 'UPGRADE NOW'}
          </button>
        </div>

      </div>
    </div>
  );
}
