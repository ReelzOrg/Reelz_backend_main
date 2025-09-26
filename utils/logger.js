import pino from 'pino';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the current file path for better log context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a development logger with pretty printing
const devLogger = pino({
  level: 'debug', // Set log level to debug for development
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

// Create a production logger with JSON formatting
const prodLogger = pino({
  level: 'info', // Set log level to info for production
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
});

// Determine which logger to use based on environment
const logger = process.env.NODE_ENV === 'production' ? prodLogger : devLogger;

/**
 * Creates a child logger with additional context
 * @param {string} moduleName - Name of the module or file
 * @returns {Object} A child logger instance
 */
export const createModuleLogger = (moduleName) => {
  return logger.child({ module: moduleName });
};

/**
 * Creates a child logger with file context
 * @param {string} filePath - The full path to the file
 * @returns {Object} A child logger instance with file context
 */
export const createFileLogger = (filePath) => {
  const relativePath = path.relative(process.cwd(), filePath);
  return logger.child({ file: relativePath });
};

// Auto-create a file logger for the current module
const currentFileLogger = createFileLogger(__filename);

// Log startup message
currentFileLogger.info('Logger initialized');

export default logger;


//==============================================================================
/*
import pino from 'pino';
import pinoHttp from 'pino-http';

// Environment-based configuration
const isDevelopment = process.env.NODE_ENV !== 'production';

// Base logger configuration
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
      ignore: 'pid,hostname',
    },
  } : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'reelz-server',
  },
});

// HTTP request logger middleware
const httpLogger = pinoHttp({
  logger,
  customLogLevel: (res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    }
    if (res.statusCode >= 500 || err) {
      return 'error';
    }
    return 'info';
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-request-id': req.id,
      },
    }),
    res: pinoHttp.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  wrapSerializers: true,
});

// Request ID generator for better tracing
const generateReqId = (req, res) => {
  const existingID = req.id || req.headers['x-request-id'];
  if (existingID) return existingID;
  
  const id = crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
};

// Child logger with context
const createChildLogger = (context = {}) => {
  return logger.child(context);
};

export { logger, httpLogger, createChildLogger, generateReqId };

 */