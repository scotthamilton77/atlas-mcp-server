/**
 * Handles metadata transformation and normalization
 */
export class MetadataTransformer {
  constructor() {}

  /**
   * Transform metadata to ensure compatibility
   * Converts arrays to objects with items property and handles nested structures
   */
  transform(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!metadata) return undefined;

    const transformed: Record<string, unknown> = {};
    const preserveArrayFields = [
      'tags',
      'deliverables',
      'acceptanceCriteria',
      'dependencies',
      'criteria',
      'testCases',
    ];

    for (const [key, value] of Object.entries(metadata)) {
      if (Array.isArray(value)) {
        // Preserve arrays for specific fields
        transformed[key] = preserveArrayFields.includes(key) ? value : { items: value };
      } else if (value && typeof value === 'object') {
        // Handle nested objects
        const nestedValue = value as Record<string, unknown>;
        const transformedNested: Record<string, unknown> = {};

        for (const [nestedKey, nestedVal] of Object.entries(nestedValue)) {
          if (Array.isArray(nestedVal)) {
            // Preserve arrays for specific fields
            transformedNested[nestedKey] = preserveArrayFields.includes(nestedKey)
              ? nestedVal
              : { items: nestedVal };
          } else if (nestedVal && typeof nestedVal === 'object') {
            transformedNested[nestedKey] = this.transform(nestedVal as Record<string, unknown>);
          } else {
            transformedNested[nestedKey] = nestedVal;
          }
        }

        transformed[key] = transformedNested;
      } else {
        transformed[key] = value;
      }
    }

    return transformed;
  }

  /**
   * Remove template reference from metadata
   */
  removeTemplateRef(metadata: Record<string, unknown>): Record<string, unknown> {
    const { templateRef: _, ...rest } = metadata;
    return rest;
  }

  /**
   * Extract template reference from metadata if present
   */
  extractTemplateRef(metadata: Record<string, unknown>):
    | {
        template: string;
        variables: Record<string, unknown>;
      }
    | undefined {
    const templateRef = metadata.templateRef as
      | {
          template: string;
          variables: Record<string, unknown>;
        }
      | undefined;

    if (templateRef && typeof templateRef.template === 'string') {
      return templateRef;
    }

    return undefined;
  }
}
