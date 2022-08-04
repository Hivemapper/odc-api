// https://cdn.sparkfun.com/assets/learn_tutorials/8/1/5/u-blox8-M8_ReceiverDescrProtSpec__UBX-13003221__Public.pdf
// https://content.u-blox.com/sites/default/files/products/documents/MultiGNSS-Assistance_UserGuide_%28UBX-13004360%29.pdf
import cp from 'child_process';
import fs from 'fs';

const DEFAULT_ALAMANC_FIXTURE = './fixtures/mgaoffline.ubx';

type UBX_MGA_COMMAND = 'UBX-MGA-FLASH-DATA' &
  'UBX_MGA_FLASH-STOP' &
  'UBX-MGA-ANO';
enum UBX_MGA_ACK {
  ACK = 'ACK',
  ABORT = 'ABORT',
}
const UBX_COMMAND_CLASS_ID_BYTES: Record<UBX_MGA_COMMAND, string> = {
  'UBX-MGA-FLASH-DATA': '0x13,0x21',
  'UBX-MGA-FLASH-STOP': '0x13,0x22',
  'UBX-MGA-ANO': '0x13,0x20',
};

function readMGAOffline(fileIn = DEFAULT_ALAMANC_FIXTURE) {
  const file = fs.readFileSync(fileIn).toString('hex');

  const blocks: string[][] = [];
  let prev = '';
  let cursor = 0;
  const msgLength = 76;
  let isPayload = false;

  for (let i = 0; i < file.length; i += 2) {
    const hex = '0x' + file[i] + '' + file[i + 1];
    if (hex === '0x20' && prev === '0x13' && !isPayload) {
      if (blocks.length) {
        console.log(blocks[blocks.length - 1]);
      }
      blocks.push([]);
      cursor = -1;
    } else {
      if (cursor > 0 && cursor < msgLength + 1 && blocks.length) {
        blocks[blocks.length - 1].push(hex);
        isPayload = true;
      } else {
        isPayload = false;
      }
      cursor++;
    }
    prev = hex;
  }

  return blocks;
}

function makeCommand(mgaCommand: UBX_MGA_COMMAND, block?: string[]) {
  //@ts-ignore
  if (block) {
    const payload: any = Array.from(block).join(',');
    return `${UBX_COMMAND_CLASS_ID_BYTES[mgaCommand]},${payload.trim()}`;
  } else {
    return UBX_COMMAND_CLASS_ID_BYTES[mgaCommand];
  }
}

function parseMsg(data: string): UBX_MGA_ACK {
  const lines = data.split('\n');
  if (!lines.length) {
    throw new Error(`Expected Message UBX-MGA-ACK`);
  }
  const i = lines.findIndex(line => line.indexOf('UBX-MGA-ACK') !== -1);
  if (i === -1) {
    throw new Error(`Expected Message UBX-MGA-ACK`);
  }
  return lines[i + 1].indexOf('type 1') !== -1
    ? UBX_MGA_ACK.ACK
    : UBX_MGA_ACK.ABORT;
}

/**
 The host downloads a copy of a latest data from the AssistNow Offline service and stores it locally.
• It sends the first 512 bytes of that data using the UBX-MGA-FLASH-DATA message.
• It awaits a UBX-MGA-FLASH-ACK message in reply.
• Based on the contents of the UBX-MGA-FLASH-ACK message, the host sends the next block, resends
the last block or aborts the whole process.
 */
export async function submitOfflineAlmanac() {
  const blocks = readMGAOffline();

  const msgQueue = blocks.map(block =>
    makeCommand('UBX-MGA-ANO' as UBX_MGA_COMMAND, block),
  );

  let idx = 0;
  while (idx < msgQueue.length) {
    const msg = msgQueue[idx];
    const cmd = `ubxtool -c ${msg}`;
    console.log(cmd);

    const resp = String(cp.execSync(cmd));
    console.log(resp);

    const parsed = parseMsg(resp);

    switch (parsed) {
      case UBX_MGA_ACK.ACK:
        idx++;
        continue;
      case UBX_MGA_ACK.ABORT:
        throw new Error('UBX-MGA-ACK says Abort!');
      default:
        continue;
    }
  }
}
