// Jest setup shared by unit and integration suites (referenced by jest.config.js).
// Kept minimal: give slow module/DB-backed tests room without per-file overrides.
jest.setTimeout(60000)
