export interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error';
  message: string;
}

class DebugLogger {
  private logs: LogEntry[] = [];
  private listeners: ((logs: LogEntry[]) => void)[] = [];
  private maxLogs = 200;
  private isEnabled = false;

  private originalLog = console.log;
  private originalWarn = console.warn;
  private originalError = console.error;

  constructor() {
    this.isEnabled = localStorage.getItem('enableDebugLog') === 'true';
    this.hijack();
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    localStorage.setItem('enableDebugLog', String(enabled));
  }

  public getLogs() {
    return this.logs;
  }

  public clearLogs() {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
    listener(this.logs);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l([...this.logs]));
  }

  private addLog(level: 'log' | 'warn' | 'error', ...args: any[]) {
    if (!this.isEnabled) return;
    
    const message = args.map(arg => {
      if (arg instanceof Error) {
        return arg.message;
      }
      return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
    }).join(' ');

    this.logs.push({
      timestamp: new Date().toISOString().split('T')[1].slice(0, -5), // HH:MM:SS
      level,
      message
    });

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.notify();
  }

  private hijack() {
    console.log = (...args) => {
      this.originalLog(...args);
      this.addLog('log', ...args);
    };
    console.warn = (...args) => {
      this.originalWarn(...args);
      this.addLog('warn', ...args);
    };
    console.error = (...args) => {
      this.originalError(...args);
      this.addLog('error', ...args);
    };
  }

  public info(...args: any[]) {
    this.originalLog(...args);
    this.addLog('log', ...args);
  }
}

export const logger = new DebugLogger();
