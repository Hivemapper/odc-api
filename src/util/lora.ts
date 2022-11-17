import { writeFileSync } from 'fs';

export const createLoraFile = (
  type: 'join' | 'message',
  content: string,
  location: string,
  filename?: string,
) => {
  const _filename = filename || Date.now() + '';
  const file = `${location}/${_filename}.${type}`;
  writeFileSync(file, JSON.stringify(content), { encoding: 'utf-8' });
  return _filename;
};
