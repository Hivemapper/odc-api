import { promises as Fs } from 'fs';

export const createDirectory = async (location: string) => {
  try {
    await Fs.access(location);
  } catch {
    await Fs.mkdir(location, { recursive: true });
  }
};

// Initialize a directory (clear or create)
export const initDirectory = async (location: string) => {
  await createDirectory(location);
  const dir = await Fs.readdir(location);
  for (const file of dir) {
    await Fs.rm(`${location}/${file}`);
  }
};
