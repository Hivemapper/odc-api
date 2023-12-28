import { exec, ExecException } from 'child_process';
import { ACL_FILES_PATH, ACL_TOOL_PATH } from '../../config';
import { promisify } from 'util';
import e, { NextFunction, Request, Response, Router } from 'express';
import {
  fromString as fromHexString,
} from 'hex-array';
const execPromise = promisify(exec);

export async function ensureAclPassed(req: Request, res: Response, next: NextFunction) {
  console.log("[ACL] Control reached middleware ensureAclPassed req.headers.cookie value", req.headers.cookie);

  if (req.headers.cookie) {

    const accessControlList = await getAccessControlListFromCamera();
    const fleetEntityId = req.headers.cookie.split('=')[1];
    console.log("[ACL] Control reached middleware ensureAclPassed accessControlList from camera", accessControlList);

    if (accessControlList) {

      const data = fromHexString(accessControlList);
      const aclResult = JSON.parse(String.fromCharCode(...data));

      if (aclResult?.acl && fleetEntityId && typeof fleetEntityId === 'string') {

        console.log("[ACL] Control reached middleware ensureAclPassed ACL result after parsing:", aclResult?.acl);

        const isAclPassed = isWhitelisted(fleetEntityId, aclResult?.acl);

        console.log("[ACL] Control reached middleware ensureAclPassed return value from whitelisted function", isAclPassed);

        if (isAclPassed) {

          next();
          return;

        }
      }
      if(!aclResult?.acl){

        console.log("[ACL] Control reached middleware ensureAclPassed ACL result is null");
        next();
        return;

      }
    }
    else {
      next();
    }
  }

  console.log("[ACL] Control reached middleware ensureAclPassed returning empty array");
  res.json([]);
}

export const getAccessControlListFromCamera = async () => {
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

const isWhitelisted = (fleetEntityId: string, acl: any): boolean => {
  console.log("[ACL] Control reached middleware ensureAclPassed in function whitelisted", acl);
  if (fleetEntityId === undefined) {
    return false;
  }

  if (acl.managers.length === 0 && acl.drivers.length === 0) {
    return true;
  }

  for (let i = 0; i < acl.managers.length; i++) {
    if (acl.managers[i].toLowerCase() === fleetEntityId.toLowerCase()) {
      return true;
    }
  }

  for (let i = 0; i < acl.drivers.length; i++) {
    if (acl.drivers[i].toLowerCase() === fleetEntityId.toLowerCase()) {
      return true;
    }
  }

  return false;
};