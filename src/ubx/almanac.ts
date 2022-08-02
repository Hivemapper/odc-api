// https://cdn.sparkfun.com/assets/learn_tutorials/8/1/5/u-blox8-M8_ReceiverDescrProtSpec__UBX-13003221__Public.pdf
// https://content.u-blox.com/sites/default/files/products/documents/MultiGNSS-Assistance_UserGuide_%28UBX-13004360%29.pdf
import cp from 'child_process';
import fs from 'fs';

const EMPTY_PAYLOAD = new UInt8Array(0);
const DEFAULT_ALAMANC_FIXTURE = 'fixtures/mgaoffline.ubx';

type UBX_MGA_COMMAND = 'UBX-MGA-FLASH-DATA' | 'UBX_MGA_FLASH-STOP';
const UBX_COMMAND_CLASS_ID_BYTES: Record<UBX_MGA_COMMAND, string> = {
  'UBX-MGA-FLASH-DATA': '0x13,0x21',
  'UBX-MGA-FLASH-STOP': '0x13,0x22',
};

function readMGAOffline(fileIn = DEFAULT_ALAMANC_FIXTURE) {
  const buf = fs.readFileSync(fileIn);
  // get blocks of 512 bytes
  const blocks: UInt8Array[] = [];

  for (let i = 0; i < buf.length; i += 512) {
    const start = i * 512;
    const end = Math.min(buf.length, (i + 1) * 512);
    blocks.push(buf.slice(start, end));
  }

  return blocks;
}

function makeCommand(mgaCommand: UBX_MGA_COMMAND, block: UInt8Array) {
  const payload = block.map(byte => `0x${byte.toString(16)}`).join(',');
  return `${UBX_COMMAND_CLASS_ID_BYTES[mgaCommand]},${payload}`;
}

function parseMsg(data: string) {
  const bytes = data.split(',');
  if (bytes[0] !== '0x03') {
    throw new Error(`Expected Message UBX-MGA-FLASH-ACK`);
  }

  switch (bytes[2]) {
    case '0x00':
      return 'ACK';
    case '0x01':
      return 'NACK-RETRY';
    case '0x02':
      return 'NACK-ABORT';
    default:
      throw new Error(`Expected reponse 0-2`);
  }
}

/**
 The host downloads a copy of a latest data from the AssistNow Offline service and stores it locally.
• It sends the first 512 bytes of that data using the UBX-MGA-FLASH-DATA message.
• It awaits a UBX-MGA-FLASH-ACK message in reply.
• Based on the contents of the UBX-MGA-FLASH-ACK message, the host sends the next block, resends
the last block or aborts the whole process.
 */
export function submitOfflineAlmanac() {
  const blocks = readMGAOffline();
  const msgQueue = blocks.map(block => makeCommand('UBX-MGA-FLASH-DATA', block));
  msgQueue.push(makeCommand('UBX-MGA-FLASH-STOP', EMPTY_PAYLOAD));

  while (idx < msgQueue.length) {
    const msg = msgQueue[idx];
    const cmd = `ubxtool -c ${msg}`;
    console.log(cmd);

    const resp = cp.execSync(cmd);
    console.log(resp);

    const parsed = parseMsg(resp);

    if (parsed === 'ACK') {
      idx++;
      continue;
    } else if (parsed === 'NACK-RETRY') {
      continue;
    } else if (parsed === 'NACK-ABORT') {
      throw new Error('UBX-MGA-FLASH-ACK says Abort!');
    }
  }
}
