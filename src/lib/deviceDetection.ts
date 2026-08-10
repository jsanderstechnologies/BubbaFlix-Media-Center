export interface DeviceCapabilities {
  isAndroidTV: boolean;
  isCustomTVBrowser: boolean;
  canDecodeHevc: boolean;
  canDecodeMkv: boolean;
  canDecodeAc3: boolean;
  canDirectPlay: boolean;
  deviceName: string;
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  if (typeof window === 'undefined') {
    return {
      isAndroidTV: false,
      isCustomTVBrowser: false,
      canDecodeHevc: false,
      canDecodeMkv: false,
      canDecodeAc3: false,
      canDirectPlay: false,
      deviceName: 'Standard Server'
    };
  }

  const ua = navigator.userAgent || '';
  const win = window as any;

  // Check custom window flags set by Android TV browser apps or native webview wrappers
  const isCustomApp = !!(
    win.isNativeAndroidTV || 
    win.isCustomTVBrowser || 
    win.AndroidNativePlayer || 
    win.AndroidInterface || 
    win.BubbaFlixNative ||
    win.isAndroidTV
  );

  // User-Agent indicators for Android TV, ExoPlayer, FireTV, Shield, etc.
  const isAndroid = /Android/i.test(ua);
  const isTV = /AndroidTV|Android TV|SmartTV|GoogleTV|AppleTV|HbbTV|NetCast|Vizio|Tizen|WebOS|AFTB|AFTM|BRAVIA|Shield|MiTV|CustomTV|BubbaFlixTV|ExoPlayer/i.test(ua);
  const isExoPlayer = /ExoPlayer/i.test(ua);

  const isAndroidTV = isTV || isExoPlayer || (isAndroid && !/Mobile/i.test(ua)) || isCustomApp;

  // HTML5 native codec capabilities detection
  let canDecodeHevc = false;
  let canDecodeMkv = false;
  let canDecodeAc3 = false;

  try {
    const v = document.createElement('video');
    
    // HEVC / H.265 test
    const hevcTest1 = v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"');
    const hevcTest2 = v.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"');
    canDecodeHevc = (hevcTest1 === 'probably' || hevcTest1 === 'maybe' || hevcTest2 === 'probably' || hevcTest2 === 'maybe');

    // MKV container test
    const mkvTest = v.canPlayType('video/x-matroska');
    canDecodeMkv = (mkvTest === 'probably' || mkvTest === 'maybe');

    // AC3 / Dolby test
    const ac3Test = v.canPlayType('audio/mp4; codecs="ac-3"');
    canDecodeAc3 = (ac3Test === 'probably' || ac3Test === 'maybe');
  } catch (e) {}

  // Android TV hardware decoders universally decode HEVC, H.264, and MKV
  if (isAndroidTV || isCustomApp) {
    canDecodeHevc = true;
    canDecodeMkv = true;
    canDecodeAc3 = true;
  }

  // Direct Play is strictly reserved for Android TV hardware & Custom TV Browser apps with native hardware decoders
  const canDirectPlay = isAndroidTV || isCustomApp;

  let deviceName = 'Standard Web Browser';
  if (isCustomApp) deviceName = 'Custom Android TV Browser (Native Hardware Decoder)';
  else if (isExoPlayer) deviceName = 'Android TV (ExoPlayer Hardware Player)';
  else if (isAndroidTV) deviceName = 'Android TV / Smart TV Hardware';
  else if (canDirectPlay) deviceName = 'Direct Play Capable Device';

  return {
    isAndroidTV,
    isCustomTVBrowser: isCustomApp,
    canDecodeHevc,
    canDecodeMkv,
    canDecodeAc3,
    canDirectPlay,
    deviceName
  };
}
