import { promises as fs } from 'fs';
import { platform } from 'os';
import { join } from 'path';

const getFileMode = () => {
    return platform() === 'win32' ? undefined : 0o755;
};

const setBuildPermissions = async () => {
    try {
        const buildPath = join(process.cwd(), 'build', 'index.js');
        const fileMode = getFileMode();
        
        if (fileMode !== undefined) {
            await fs.chmod(buildPath, fileMode);
        }
        
        console.log('Build permissions set successfully');
    } catch (error) {
        console.error('Failed to set build permissions:', error);
        process.exit(1);
    }
};

setBuildPermissions();
