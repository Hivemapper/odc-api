import { exec, ExecException } from 'child_process';

export function getJamInd() {
  var jamInd = undefined;
  try {
    exec(
      'ubxtool -p MON-RF | grep jamInd',
      { encoding: 'utf-8' },
      (error: ExecException | null, stdout: string) => {
        let output = error ? '' : stdout;
        // get jamInd 
        const line = output.split("\n").shift() // we should only get one in the output
        if (!line) {
          throw new Error("jamInd not found")
        }
        const parts = line.split(" ")
        const jamIndIndex = parts.findIndex(
          elem => elem.indexOf("jamInd") !== -1,
        );
        if (jamIndIndex !== -1) {
          jamInd = parts[jamIndIndex + 1]
        }
      }
    )
  } catch (e: unknown) {
    console.log(e);
  }
  return jamInd
}