import { logger } from './logger';

export interface WeatherAlert {
  id: string;
  event: string; // e.g. "Tornado Warning", "Flash Flood Watch"
  headline: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  urgency?: string;
  areaDesc?: string;
  description?: string;
  instruction?: string;
  effective?: string;
  expires?: string;
}

// Memory / LocalStorage set for dismissed alert IDs
const DISMISSED_ALERTS_KEY = 'bubbaflix_dismissed_weather_alerts';

export function getDismissedAlertIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_ALERTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function dismissAlertId(alertId: string) {
  try {
    const dismissed = getDismissedAlertIds();
    if (!dismissed.includes(alertId)) {
      dismissed.push(alertId);
      localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(dismissed));
    }
  } catch (e) {
    console.error('Error saving dismissed alert ID:', e);
  }
}

export function pushAlertToAndroidTV(alert: WeatherAlert) {
  try {
    // 1. Android TV JavaScript Interface Bridges
    if ((window as any).AndroidInterface?.pushWeatherAlert) {
      (window as any).AndroidInterface.pushWeatherAlert(JSON.stringify(alert));
    }
    if ((window as any).AndroidTV?.pushNotification) {
      (window as any).AndroidTV.pushNotification(alert.event, alert.headline || alert.description);
    }
    if ((window as any).AndroidNativePlayer?.onWeatherAlert) {
      (window as any).AndroidNativePlayer.onWeatherAlert(JSON.stringify(alert));
    }
    if ((window as any).isNativeAndroidTV || (window as any).isCustomTVBrowser) {
      window.dispatchEvent(new CustomEvent('androidtv_weather_alert', { detail: alert }));
    }

    // 2. HTML5 System Push Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🚨 ${alert.event}`, {
        body: alert.headline || alert.description || 'Active Severe Weather Alert',
        tag: alert.id,
        requireInteraction: alert.severity === 'Extreme' || alert.severity === 'Severe'
      });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          new Notification(`🚨 ${alert.event}`, {
            body: alert.headline || alert.description || 'Active Severe Weather Alert',
            tag: alert.id
          });
        }
      });
    }
  } catch (e) {
    console.error('Error pushing weather alert to Android TV:', e);
  }
}

export async function fetchActiveWeatherAlerts(lat: number, lon: number): Promise<WeatherAlert[]> {
  try {
    const nwsUrl = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
    const res = await fetch(nwsUrl, {
      headers: {
        'User-Agent': '(BubbaFlix-Media-Center, weather-alert-service)'
      }
    }).then(r => r.json()).catch(() => null);

    if (res && res.features && Array.isArray(res.features)) {
      const activeAlerts: WeatherAlert[] = res.features.map((f: any) => ({
        id: f.id || f.properties?.id || `alert-${f.properties?.event}-${f.properties?.effective}`,
        event: f.properties?.event || 'Weather Alert',
        headline: f.properties?.headline || f.properties?.event || 'Active Weather Alert Issued',
        severity: f.properties?.severity || 'Moderate',
        urgency: f.properties?.urgency,
        areaDesc: f.properties?.areaDesc,
        description: f.properties?.description,
        instruction: f.properties?.instruction,
        effective: f.properties?.effective,
        expires: f.properties?.expires
      }));

      const dismissed = getDismissedAlertIds();
      const newAlerts = activeAlerts.filter(a => !dismissed.includes(a.id));

      if (newAlerts.length > 0) {
        logger.info(`WeatherAlerts: Detected ${newAlerts.length} active severe weather alerts`, {
          events: newAlerts.map(a => a.event)
        });
        // Push top alert to Android TV native bridge & system notification
        pushAlertToAndroidTV(newAlerts[0]);
      }

      return newAlerts;
    }

    return [];
  } catch (err) {
    console.error('Failed to fetch NWS weather alerts:', err);
    return [];
  }
}
