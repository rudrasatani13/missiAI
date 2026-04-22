// Client-side logger utility
// This ensures that we do not spam console logs in production environments
// while still giving us visibility during development.

const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";

export const logger = {
  error: (...args: any[]) => {
    if (isDev) {
      console.error(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args);
    }
  },
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  }
};
