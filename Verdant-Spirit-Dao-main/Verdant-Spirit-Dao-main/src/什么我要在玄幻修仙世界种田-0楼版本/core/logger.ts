// core/logger.ts

declare const $: any;

type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data: any[];
}

let isDebugMode: boolean | null = null;
let logContainer: JQuery<HTMLElement> | null = null;
let logHistory: LogEntry[] = [];

/**
 * Safely stringifies an object, handling circular references.
 * @param obj The object to stringify.
 * @param space The space argument for JSON.stringify.
 * @param externalCache An optional external cache to use for tracking circular references.
 * @returns A JSON string.
 */
export function safeJsonStringify(obj: any, space?: number, externalCache?: Set<any>): string {
  const cache = externalCache ?? new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular Reference]';
      }
      cache.add(value);
    }
    return value;
  }, space);
}

/**
 * Checks localStorage to determine if debug mode is enabled.
 * Caches the result to avoid repeated localStorage access.
 */
function checkDebugMode() {
  if (isDebugMode === null) {
    isDebugMode = localStorage.getItem('xuanhuan.debugMode') === 'true';
  }
  return isDebugMode;
}

/**
 * Appends a formatted log entry to the debug modal's log container.
 * @param level The severity level of the log.
 * @param moduleName The name of the module logging the message.
 * @param message The primary message.
 * @param additionalData Optional additional data.
 */
function logToModal(level: LogLevel, moduleName: string, message: any, ...additionalData: any[]) {
  if (!logContainer) {
    logContainer = $('#debug-log-container');
    if (logContainer.length === 0) {
      logContainer = null;
    }
  }

  const timestamp = new Date().toLocaleTimeString();
  
  const entry: LogEntry = {
    timestamp,
    level,
    source: moduleName,
    message: typeof message === 'object' ? safeJsonStringify(message, 2) : String(message),
    data: additionalData.map(d => typeof d === 'object' ? safeJsonStringify(d, 2) : d),
  };
  logHistory.push(entry);

  if (!logContainer) {
    return;
  }

  let colorClass = '';
  switch (level) {
    case 'info': colorClass = 'text-green-400'; break;
    case 'warn': colorClass = 'text-yellow-400'; break;
    case 'error': colorClass = 'text-red-400'; break;
    default: colorClass = 'text-cyan-400'; break;
  }

  const additionalDataStr = additionalData.map(d => typeof d === 'object' ? safeJsonStringify(d, 2) : String(d)).join(' ');
  const logMessageContent = entry.message + ' ' + additionalDataStr;
  const truncationLength = 200;
  let displayMessage;

  if (logMessageContent.length > truncationLength) {
    displayMessage = `
      <span class="log-message-short">${logMessageContent.substring(0, truncationLength)}...</span>
      <a href="#" class="log-expand-btn">显示更多</a>
      <span class="log-message-full" style="display: none;">${logMessageContent}</span>
    `;
  } else {
    displayMessage = `<span class="log-message-full">${logMessageContent}</span>`;
  }

  const logEntryEl = $(`
    <div class="debug-log-entry" data-level="${level}">
      <span class="${colorClass} font-bold">[${timestamp}] [${moduleName}]</span>
      ${displayMessage}
    </div>
  `);
  
  if (logContainer) {
    logContainer.append(logEntryEl);
    if (logContainer[0]) {
      logContainer.scrollTop(logContainer[0].scrollHeight);
    }
  }
}

/**
 * A centralized logger that only outputs to the console when debug mode is enabled.
 * 
 * @param level The severity level of the log ('log', 'info', 'warn', 'error').
 * @param moduleName The name of the module or component logging the message.
 * @param message The primary message or object to log.
 * @param additionalData Optional additional data to log.
 */
export function logger(level: LogLevel, moduleName: string, message: any, ...additionalData: any[]) {
  if (!checkDebugMode()) {
    return;
  }

  logToModal(level, moduleName, message, ...additionalData);

  const timestamp = new Date().toLocaleTimeString();
  const style = 'font-weight: bold;';
  
  let color = '';
  switch (level) {
    case 'info': color = 'color: #28a745;'; break;
    case 'warn': color = 'color: #ffc107;'; break;
    case 'error': color = 'color: #dc3545;'; break;
    default: color = 'color: #17a2b8;'; break;
  }

  console[level](
    `%c[${timestamp}] [${moduleName}]`,
    `${style} ${color}`,
    message,
    ...additionalData
  );
}

/**
 * Forces a re-check of the debug mode status from localStorage.
 */
export function refreshLoggerStatus() {
  isDebugMode = null;
  checkDebugMode();
}

/**
 * Clears all logs from the in-memory history.
 */
export function clearLogs() {
  logHistory = [];
}

/**
 * Gets all stored logs as a single plain text string, with an option to filter by module.
 * @param modulesToInclude An optional array of module names to include. If not provided, all logs are returned.
 * @returns A string containing all log entries, separated by newlines.
 */
export function getLogsAsText(modulesToInclude?: string[]): string {
  const logsToProcess = modulesToInclude
    ? logHistory.filter(entry => modulesToInclude.includes(entry.source))
    : logHistory;

  return logsToProcess.map(entry => {
    // Data is already stringified, so we can just join it.
    const dataStr = entry.data.join(' ');
    return `${entry.timestamp} [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message} ${dataStr}`;
  }).join('\n');
}

/**
 * Gets the structured log history.
 */
export function getLogs(): LogEntry[] {
  return logHistory;
}
