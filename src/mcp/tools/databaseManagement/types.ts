import { z } from "zod";

// Empty schema since clean operation takes no parameters
export const CleanDatabaseSchemaShape = {} as const;

// Schema for validating clean database input
export const cleanDatabaseInputSchema = z.object(CleanDatabaseSchemaShape).strict();

export type CleanDatabaseInput = z.infer<typeof cleanDatabaseInputSchema>;

// Output interface for database cleaning operation
export interface CleanDatabaseOutput {
  success: boolean;    // Operation success status
  message: string;     // Operation result message
  details?: {
    nodesDeleted: number;         // Count of deleted nodes
    relationshipsDeleted: number; // Count of deleted relationships
  };
}