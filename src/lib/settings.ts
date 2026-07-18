import { useState, useEffect } from 'react';

export interface SystemSettings {
  tmdbKey?: string;
  torboxApiKey?: string;
  geminiApiKey?: string;
  preferHEVC?: boolean;
  maxResults?: string;
  streamBufferSeconds?: string;
  iptvUrl?: string;
  epgUrl?: string;
  epgOffset?: string;
  xtreamServer?: string;
  xtreamUsername?: string;
  xtreamPassword?: string;
  usenetHost?: string;
  usenetPort?: string;
  usenetUsername?: string;
  usenetPassword?: string;
  enableUsenetSearch?: boolean;
  enableTorrentSearch?: boolean;
  intelTranscoding?: boolean;
  disableLogin?: boolean;
}

export interface UserSettings {
  resolutions?: string[];
  audioLanguage?: string;
  ccLanguage?: string;
  autoCC?: boolean;
  enableAudioLeveling?: boolean;
  filterAnime?: boolean;
  preferredLanguage?: string;
  playerPath?: string;
  enabledGroups?: string[];
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  resolutions: ['4K', '1080p', '720p'],
  audioLanguage: 'eng',
  ccLanguage: 'eng',
  autoCC: false,
  enableAudioLeveling: false,
  filterAnime: false,
  preferredLanguage: 'all',
  playerPath: 'mpv',
  enabledGroups: []
};

// Global state to avoid prop drilling and multiple fetches
let globalSystemSettings: SystemSettings = {};
let globalUserSettings: UserSettings = DEFAULT_USER_SETTINGS;
let globalZoom: number = parseFloat(localStorage.getItem('zoom') || '1');

type SystemSettingsListener = (settings: SystemSettings) => void;
type UserSettingsListener = (settings: UserSettings) => void;
type ZoomListener = (zoom: number) => void;

let systemSettingsListeners: SystemSettingsListener[] = [];
let userSettingsListeners: UserSettingsListener[] = [];
let zoomListeners: ZoomListener[] = [];
let fetched = false;

export function fetchSettings() {
  if (fetched) return;
  fetched = true;

  // Fetch System Settings
  fetch('/api/auth/config')
    .then(res => res.json())
    .then(data => {
      globalSystemSettings = data;
      systemSettingsListeners.forEach(fn => fn(data));
    })
    .catch(console.error);

  // Fetch User Settings if auth token exists
  const token = localStorage.getItem('authToken');
  if (token) {
    fetch('/api/user/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          globalUserSettings = { ...DEFAULT_USER_SETTINGS, ...data.settings };
          userSettingsListeners.forEach(fn => fn(globalUserSettings));
        }
      })
      .catch(console.error);
  }
}

export function updateSystemSettings(newSettings: SystemSettings) {
  globalSystemSettings = { ...globalSystemSettings, ...newSettings };
  systemSettingsListeners.forEach(fn => fn(globalSystemSettings));
  
  const token = localStorage.getItem('authToken');
  if (token) {
    fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(newSettings)
    }).catch(console.error);
  }
}

export function updateUserSettings(newSettings: Partial<UserSettings>) {
  globalUserSettings = { ...globalUserSettings, ...newSettings };
  userSettingsListeners.forEach(fn => fn(globalUserSettings));

  const token = localStorage.getItem('authToken');
  if (token) {
    fetch('/api/user/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(newSettings)
    }).catch(console.error);
  }
}

export function updateZoom(zoom: number) {
  globalZoom = zoom;
  localStorage.setItem('zoom', zoom.toString());
  zoomListeners.forEach(fn => fn(globalZoom));
  document.documentElement.style.zoom = globalZoom.toString();
  document.documentElement.style.setProperty('--zoom-level', globalZoom.toString());
}

export function useSettings() {
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(globalSystemSettings);
  const [userSettings, setUserSettings] = useState<UserSettings>(globalUserSettings);
  const [zoom, setZoom] = useState<number>(globalZoom);

  useEffect(() => {
    fetchSettings();

    systemSettingsListeners.push(setSystemSettings);
    userSettingsListeners.push(setUserSettings);
    zoomListeners.push(setZoom);

    // Initial zoom application
    document.documentElement.style.zoom = globalZoom.toString();
    document.documentElement.style.setProperty('--zoom-level', globalZoom.toString());

    return () => {
      systemSettingsListeners = systemSettingsListeners.filter(fn => fn !== setSystemSettings);
      userSettingsListeners = userSettingsListeners.filter(fn => fn !== setUserSettings);
      zoomListeners = zoomListeners.filter(fn => fn !== setZoom);
    };
  }, []);

  return { systemSettings, userSettings, zoom, updateSystemSettings, updateUserSettings, updateZoom };
}
