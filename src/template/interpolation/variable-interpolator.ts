/**
 * Handles variable interpolation for templates
 */
export class VariableInterpolator {
  constructor() {}

  /**
   * Interpolate variables in a string
   */
  interpolateString(str: string, variables: Record<string, unknown>): string {
    return str.replace(/\${(\w+)}/g, (_, key) => {
      if (!(key in variables)) {
        throw new Error(`Variable not found: ${key}`);
      }
      return String(variables[key]);
    });
  }

  /**
   * Interpolate variables in metadata
   */
  interpolateMetadata(
    metadata: Record<string, unknown>,
    variables: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        result[key] = this.interpolateString(value, variables);
      } else if (Array.isArray(value)) {
        result[key] = value.map(item =>
          typeof item === 'string' ? this.interpolateString(item, variables) : item
        );
      } else if (value && typeof value === 'object') {
        result[key] = this.interpolateMetadata(value as Record<string, unknown>, variables);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Validate all required variables are provided
   */
  validateRequiredVariables(
    required: { name: string; required: boolean }[],
    provided: Record<string, unknown>
  ): string[] {
    return required.filter(v => v.required && !(v.name in provided)).map(v => v.name);
  }
}
