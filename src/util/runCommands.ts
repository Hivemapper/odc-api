import { exec } from 'child_process';
import { promisify } from 'util';

const asyncExec = promisify(exec);

export const runSequence = async(cmds: string[]) => {
    try{
        for await (const cmd of cmds) {
            const { stderr } = await asyncExec(cmd);
            if(stderr){
                console.log("From runcommands Sequence Error recorded:", stderr);
                throw stderr;
            }
        }
    } catch(error: any){
        console.log("From runcommands Sequence catching the error:",error.toString());
        if(error?.stderr.toString().includes("not loaded")){
            return;
        }else{
            throw error;
        }
    }
    
}