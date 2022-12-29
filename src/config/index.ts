export * from './hdc'
const packageJson = require('./package.json')
export const API_VERSION = packageJson.version
export const isDev = () => {
  return false
}
