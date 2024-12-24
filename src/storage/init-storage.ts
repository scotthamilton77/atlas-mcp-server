#!/usr/bin/env node
import { createDefaultStorage } from './factory.js';
import { Logger } from '../logging/index.js';
import { ConfigManager } from '../config/index.js';
import { TaskType } from '../types/task.js';

async function initStorage() {
    try {
        // Load environment variables from .env file if present
        try {
            const { config } = await import('dotenv');
            config();
        } catch (error) {
            // Ignore error if .env file doesn't exist
        }

        // Initialize configuration with defaults from ConfigManager
        const configManager = ConfigManager.getInstance();
        
        // Only override what's needed for initialization
        await configManager.updateConfig({
            logging: {
                console: true, // Enable console logging for initialization
                file: true    // Enable file logging
            }
        });

        // Initialize logger with config
        const config = configManager.getConfig();
        Logger.initialize(config.logging);
        const logger = Logger.getInstance();

        logger.info('Initializing storage with configuration:', {
            env: config.env,
            storage: {
                baseDir: config.storage.baseDir,
                name: config.storage.name,
                connection: config.storage.connection,
                performance: config.storage.performance
            },
            logging: config.logging
        });

        // Initialize storage and create database
        const storage = await createDefaultStorage();
        
        // Create a test task to verify database functionality
        await storage.createTask({
            path: '_test/init',
            name: 'Test Task',
            type: TaskType.TASK,
            description: 'Test task to verify database initialization'
        });

        // Get metrics again to verify task creation
        const updatedMetrics = await storage.getMetrics();
        logger.info('Test task created successfully', { metrics: updatedMetrics });

        // Delete test task
        await storage.deleteTask('_test/init');

        // Optimize database
        await storage.vacuum();
        await storage.analyze();
        await storage.checkpoint();

        // Close storage after initialization
        await storage.close();
        logger.info('Storage connection closed');

        process.exit(0);
    } catch (error) {
        // Try to get logger instance if available
        try {
            const logger = Logger.getInstance();
            logger.error('Failed to initialize storage', error);
        } catch {
            // Fallback to console if logger isn't initialized
            console.error('Failed to initialize storage:', error);
        }
        process.exit(1);
    }
}

initStorage().catch((error) => {
    console.error('Fatal error during storage initialization:', error);
    process.exit(1);
});
