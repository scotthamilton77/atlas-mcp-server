import { logger } from '../../../utils/logger.js';
import { addProjectNote as addProjectNoteDb, addProjectNotesBulk } from '../../../neo4j/projectService.js';
import { AddProjectNoteSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, ProjectErrorCode, NoteErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';
import { generateCustomId } from '../../../utils/idGenerator.js';

export const addProjectNote = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = AddProjectNoteSchema.parse(input);

    // Validate tags helper function
    const validateTags = (tags?: string[]) => {
      if (tags) {
        const invalidTags = tags.filter(tag => /\s/.test(tag));
        if (invalidTags.length > 0) {
          throw new McpError(
            NoteErrorCode.INVALID_TAGS,
            `Tags cannot contain whitespace: ${invalidTags.join(', ')}`,
            { invalidTags }
          );
        }
      }
    };

    if (validatedInput.mode === 'bulk') {
      // Bulk note creation
      logger.info("Adding multiple notes to project", { 
        projectId: validatedInput.projectId,
        count: validatedInput.notes.length,
        requestId: context.requestContext?.requestId 
      });

      // Validate all tags in bulk notes
      validatedInput.notes.forEach(note => validateTags(note.tags));

      try {
        const now = new Date().toISOString();
        const notes = await addProjectNotesBulk(
          validatedInput.projectId,
          validatedInput.notes.map(note => ({
            customId: generateCustomId('NOTE'),
            text: note.text,
            tags: note.tags || [],
            timestamp: now
          }))
        );

        logger.info("Notes added successfully", { 
          projectId: validatedInput.projectId,
          count: notes.length,
          noteIds: notes.map(n => n.id),
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify({
          success: true,
          message: `Successfully added ${notes.length} notes`,
          notes
        }, null, 2));
      } catch (dbError: any) {
        // Handle project not found error
        if (dbError.message?.includes('not found')) {
          throw new McpError(
            ProjectErrorCode.PROJECT_NOT_FOUND,
            `Project with ID ${validatedInput.projectId} not found`,
            { projectId: validatedInput.projectId }
          );
        }
        throw dbError;
      }
    } else {
      // Single note creation
      const { mode, ...noteData } = validatedInput;
      
      logger.info("Adding note to project", { 
        projectId: noteData.projectId,
        tags: noteData.tags,
        requestId: context.requestContext?.requestId 
      });

      // Validate tags
      validateTags(noteData.tags);

      try {
        const now = new Date().toISOString();
        const note = await addProjectNoteDb(noteData.projectId, {
          customId: generateCustomId('NOTE'),
          text: noteData.text,
          tags: noteData.tags || [],
          timestamp: now
        });

        logger.info("Note added successfully", { 
          projectId: noteData.projectId,
          noteId: note.id,
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify(note, null, 2));
      } catch (dbError: any) {
        // Handle project not found error
        if (dbError.message?.includes('not found')) {
          throw new McpError(
            ProjectErrorCode.PROJECT_NOT_FOUND,
            `Project with ID ${noteData.projectId} not found`,
            { projectId: noteData.projectId }
          );
        }
        throw dbError;
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error adding note(s) to project", { 
      error, 
      projectId: (input as any)?.projectId,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error adding note(s) to project: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { 
        projectId: (input as any)?.projectId,
        text: (input as any)?.text?.substring(0, 100) // Include truncated text in error details
      }
    );
  }
};