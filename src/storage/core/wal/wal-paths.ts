/**
 * WAL file path utilities
 */

/**
 * Get WAL file paths for a database
 */
export function getWALPaths(dbPath: string) {
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  return {
    walPath,
    shmPath,
  };
}
