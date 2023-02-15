import { exec } from 'child_process';

export const restartP2P = () => {
  exec('systemctl restart wifiP2P');
};
