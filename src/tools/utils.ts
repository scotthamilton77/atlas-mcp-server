/**
 * Utility functions for tool operations
 */

/**
 * Formats a response object for consistent output
 * @param response The response object to format
 * @returns Formatted response string
 */
export function formatResponse(response: unknown): string {
    return JSON.stringify(response, null, 2);
}

/**
 * Validates that required parameters are present in a request
 * @param params The parameters object to validate
 * @param required Array of required parameter names
 * @throws Error if any required parameter is missing
 */
export function validateRequiredParams(params: Record<string, unknown>, required: string[]): void {
    for (const param of required) {
        if (!(param in params)) {
            throw new Error(`Missing required parameter: ${param}`);
        }
    }
}

/**
 * Sanitizes a string for safe usage
 * @param input The string to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
    return input.trim();
}

/**
 * Validates string length is within limits
 * @param input The string to validate
 * @param maxLength Maximum allowed length
 * @param fieldName Name of the field for error message
 * @throws Error if string exceeds maximum length
 */
export function validateStringLength(input: string, maxLength: number, fieldName: string): void {
    if (input.length > maxLength) {
        throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
    }
}
