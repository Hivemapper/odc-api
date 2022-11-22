import { promises as Fs } from 'fs';

export const createLoraFile = async (
  type: 'join' | 'message',
  content: string,
  location: string,
  filename?: string,
) => {
  const _filename = filename || Date.now() + '';
  const file = `${location}/${_filename}.${type}`;
  await Fs.writeFile(file, content, { encoding: 'utf-8' });
  return _filename;
};
