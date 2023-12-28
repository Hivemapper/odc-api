import { exec, ExecException } from 'child_process';
import { ACL_FILES_PATH, ACL_TOOL_PATH } from '../config';
import { promisify } from 'util';
const execPromise = promisify(exec);

export const getAccessControlListFromCamera = async() => {
    try {
        const { stdout, stderr } = await execPromise(`${ACL_TOOL_PATH} load ${ACL_FILES_PATH}`, { encoding: 'utf-8' });
        if (stderr) {
            throw new Error(stderr);
        }

        return stdout;
    } catch (error: unknown) {
        console.log("Error reading ACL file from metadata.ts");
        return null;
    }
};

const isWhitelisted = (walletAddress: string, acl: any):boolean => {
    if (walletAddress === undefined) {
        return false;
      }

      if (acl.managers.length === 0 && acl.drivers.length === 0) {
        return true;
      }

      for (let i = 0; i < acl.managers.length; i++) {
        if (acl.managers[i].toLowerCase() === walletAddress.toLowerCase()) {
          return true;
        }
      }

      for (let i = 0; i < acl.drivers.length; i++) {
        if (acl.drivers[i].toLowerCase() === walletAddress.toLowerCase()) {
          return true;
        }
      }

      return false;
};

export const checkifAclPassed = (isConnectedToCamera: boolean, fleetEntityWalletAddress: any, acl: any): boolean => {
    if (!acl) {
        return false;
    }

    if (!fleetEntityWalletAddress) {
        console.log(
            '=== DASHCAM IS LOCKED BECAUSE THERE IS NO FLEET ENTITY. Imagery packaging and all the download operations are disabled from the camera. ===',
            'HDC locked:',
            true,
            'connected to hdc:',
            isConnectedToCamera,
            'acl loaded:',
            true,
        );
        return false;
    }
    const ensureAclPassed =
        isConnectedToCamera && !!acl && isWhitelisted(fleetEntityWalletAddress,acl);

    if (!ensureAclPassed) {
        console.log(
            '=== Wrong username is trying to access fleet dashcam images  ===',
            'HDC locked:',
            ensureAclPassed,
            'connected to hdc:',
            isConnectedToCamera,
            'acl loaded:',
            true,
            'address to check:',
            fleetEntityWalletAddress,
        );
    }

    return ensureAclPassed;
};