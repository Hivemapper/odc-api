import { exec } from 'child_process';
import { ACL_FILES_PATH, ACL_TOOL_PATH } from '../../config';
import { promisify } from 'util';
import { NextFunction, Request, Response } from 'express';
import {
  fromString as fromHexString,
} from 'hex-array';
import { parseCookie } from 'util/index';
import { Instrumentation } from 'util/instrumentation';
const execPromise = promisify(exec);

export async function ensureAclPassed(req: Request, res: Response, next: NextFunction) {

  try {
    const accessControlList = await getAccessControlListFromCamera();
    let aclResult = {
      acl: null
    };
    let fleetEntityId = null;

    if (accessControlList && req?.headers?.cookie) {
      fleetEntityId = parseCookie(req.headers.cookie, 'aclId');

      const data = fromHexString(accessControlList);
      try {
        aclResult = JSON.parse(String.fromCharCode(...data));
      } catch (e: unknown) {
        // console.log('Error parsing ACL JSON:', e);
      }
  
      if (aclResult?.acl && fleetEntityId && typeof fleetEntityId === 'string') {
  
        const isAclPassed = isWhitelisted(fleetEntityId, aclResult?.acl);
  
        if (isAclPassed) {
          next();
          return;
        }
      }
      if (!aclResult?.acl) {
        next();
        return;
      }
    }
    else {
      next();
      return;
    }
  
    console.log("[ACL] Control reached middleware ensureAclPassed returning empty array", req?.headers?.cookie, aclResult?.acl);
    Instrumentation.add({
      event: 'DashcamApiError',
      message: 'ACL restriction',
    });
    res.json([]);
  } catch (error: unknown) {
    console.log('Error processing ACL', error);
    Instrumentation.add({
      event: 'DashcamApiError',
      message: 'ACL error',
    });
    next();
  }
}

export const getAccessControlListFromCamera = async () => {
  try {
    const { stdout, stderr } = await execPromise(`${ACL_TOOL_PATH} load ${ACL_FILES_PATH}`, { encoding: 'utf-8' });
    if (stderr) {
      throw new Error(stderr);
    }

    return stdout;
  } catch (error: unknown) {
    console.log("Error reading ACL file from acl.ts middleware");
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