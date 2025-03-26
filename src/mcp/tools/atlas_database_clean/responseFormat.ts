import { ResponseFormatter, createFormattedResponse } from "../../../utils/responseFormatter.js";
import { FormattedDatabaseCleanResponse } from "./types.js";

/**
 * Formatter for database clean operation responses
 */
export class DatabaseCleanFormatter implements ResponseFormatter<FormattedDatabaseCleanResponse> {
  format(data: FormattedDatabaseCleanResponse): string {
    const { success, message, timestamp, details } = data;
    
    // Create a summary section with operation results
    const summaryHeader = success ? "Database Reset Successfully" : "Database Reset Failed";
    const summary = `${summaryHeader}\n\n` +
      `Status: ${success ? "✅ Success" : "❌ Failed"}\n` +
      `Message: ${message}\n` +
      `Timestamp: ${new Date(timestamp).toLocaleString()}\n`;
    
    // Add details section if available
    let detailsSection = "";
    if (details) {
      detailsSection = "\nOperation Details\n\n";
      
      if (details.deletedRelationships !== undefined) {
        detailsSection += `Relationships Removed: ${details.deletedRelationships}\n`;
      }
      
      if (details.deletedNodes !== undefined) {
        detailsSection += `Nodes Removed: ${details.deletedNodes}\n`;
      }
      
      if (details.schemaInitialized !== undefined) {
        detailsSection += `Schema Reinitialized: ${details.schemaInitialized ? "Yes" : "No"}\n`;
      }
    }
    
    // Add warning about permanent data loss
    const warning = "\n⚠️ WARNING\n" +
      "This operation has permanently removed all data from the database. " +
      "This action cannot be undone. If you need to restore the data, you must use a backup.";
    
    return `${summary}${detailsSection}${warning}`;
  }
}

/**
 * Create a formatted, human-readable response for the atlas_database_clean tool
 * 
 * @param data The raw database clean response data
 * @param isError Whether this response represents an error condition
 * @returns Formatted MCP tool response with appropriate structure
 */
export function formatDatabaseCleanResponse(data: FormattedDatabaseCleanResponse, isError = false): any {
  return createFormattedResponse(data, new DatabaseCleanFormatter(), isError);
}
