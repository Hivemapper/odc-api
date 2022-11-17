import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';

export const createDirectory = (location: string) => {
  if (!existsSync(location)) {
    mkdirSync(location, { recursive: true });
  }
};

// Initialize a directory (clear or create)
export const initDirectory = (location: string) => {
  createDirectory(location);
  readdirSync(location).forEach(f => rmSync(`${location}/${f}`));
};
