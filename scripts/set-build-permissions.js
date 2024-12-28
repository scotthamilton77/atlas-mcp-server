import { PlatformCapabilities } from '../src/utils/platform-utils.js';
import { promises as fs } from 'fs';
import { join } from 'path';

const setBuildPermissions = async () => {
    try {
        const buildPath = join(process.cwd(), 'build', 'index.js');
        const fileMode = PlatformCapabilities.getFileMode(0o755);
        
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
