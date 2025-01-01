import { promises as fs } from 'fs';
import { platform } from 'os';
import { join } from 'path';

const getFileMode = () => {
    return platform() === 'win32' ? undefined : 0o755;
};

async function fileExists(path) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

const setBuildPermissions = async () => {
    const buildPath = join(process.cwd(), 'build', 'index.js');
    const fileMode = getFileMode();

    // Skip permission setting on Windows
    if (fileMode === undefined) {
        console.log('Skipping build permissions on Windows');
        return;
    }

    try {
        // Verify build file exists
        if (!await fileExists(buildPath)) {
            console.error('Build file not found. Please ensure TypeScript compilation succeeded.');
            process.exit(1);
        }

        await fs.chmod(buildPath, fileMode);
        console.log('Build permissions set successfully');
    } catch (error) {
        console.error('Failed to set build permissions:', error);
        console.error('This may affect the executable nature of the build file.');
        process.exit(1);
    }
};

setBuildPermissions().catch(error => {
    console.error('Unexpected error during permission setting:', error);
    process.exit(1);
});
