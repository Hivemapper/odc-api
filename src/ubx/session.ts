import crypto from 'crypto';
import { exec } from 'child_process';

interface ISessionId {
  sessionId0: string;
  sessionId1: string;
  sessionId2: string;
}

function createRandomSessionId(): ISessionId {
  return {
    sessionId0: crypto.randomBytes(16).toString('hex'),
    sessionId1: crypto.randomBytes(16).toString('hex'),
    sessionId2: crypto.randomBytes(16).toString('hex'),
  };
}

function formatSessionIdForUbxtool(sessionId: string): string {
  const hexDigitPairs = sessionId.match(/.{1,2}/g);
  const formattedDigitPairs =
    hexDigitPairs && hexDigitPairs.length
      ? hexDigitPairs.map(pair => `0x${pair}`)
      : [];
  return formattedDigitPairs.join(',') || '';
}

function setSessionId(sessionId: ISessionId) {
  const sessId0cmd = `ubxtool -c 0x06,0x8a,0x00,0x01,0x00,0x00,0x06,0x00,0xf6,0x50,${formatSessionIdForUbxtool(
    sessionId.sessionId0,
  )}`;
  const sessId1cmd = `ubxtool -c 0x06,0x8a,0x00,0x01,0x00,0x00,0x07,0x00,0xf6,0x50,${formatSessionIdForUbxtool(
    sessionId.sessionId1,
  )}`;
  const sessId2cmd = `ubxtool -c 0x06,0x8a,0x00,0x01,0x00,0x00,0x08,0x00,0xf6,0x50,${formatSessionIdForUbxtool(
    sessionId.sessionId2,
  )}`;
  try {
    exec(sessId0cmd);
    exec(sessId1cmd);
    exec(sessId2cmd);
  } catch (e) {
    console.log(`Failed to set Session ID: ${e}`);
  }
  return;
}

function enableSecEcSignatures() {
  const secEcSignCommand = `ubxtool -c 0x06,0x8a,0x00,0x01,0x00,0x00,0x4b,0x03,0x91,0x20,0x01`;
  try {
    exec(secEcSignCommand);
  } catch (e) {
    console.log(`Failed to enable SEC-EC signatures: ${e}`);
  }
  return;
}

export function initUbxSessionAndSignatures() {
  const id = createRandomSessionId();
  setSessionId(id);
  enableSecEcSignatures();
  return;
}
