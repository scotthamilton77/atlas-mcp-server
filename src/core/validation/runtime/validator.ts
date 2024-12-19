import { Task } from '../../../shared/types/task.js';
import {
  RuntimeValidator as IRuntimeValidator,
  RuntimeChecker,
  ValidationContext,
  ValidationOptions,
  ValidationResult,
  ValidationError
} from '../types.js';
import { DataIntegrityChecker } from './integrity.js';
import { ConsistencyChecker } from './consistency.js';

/**
 * Runtime validator that combines integrity and consistency checks
 */
export class RuntimeValidator implements IRuntimeValidator {
  private checkers = new Map<string, RuntimeChecker>();

  constructor() {
    // Initialize with default checkers
    const integrityChecker = new DataIntegrityChecker();
    const consistencyChecker = new ConsistencyChecker();

    this.addChecker({
      id: 'integrity',
      name: 'Data Integrity Checker',
      description: 'Validates data integrity and format',
      check: integrityChecker.check.bind(integrityChecker)
    });

    this.addChecker({
      id: 'consistency',
      name: 'Data Consistency Checker',
      description: 'Validates data consistency and relationships',
      check: consistencyChecker.check.bind(consistencyChecker)
    });
  }

  /**
   * Add a runtime checker
   */
  addChecker(checker: RuntimeChecker): void {
    if (this.checkers.has(checker.id)) {
      throw new Error(`Checker with ID ${checker.id} already exists`);
    }
    this.checkers.set(checker.id, checker);
  }

  /**
   * Remove a runtime checker
   */
  removeChecker(checkerId: string): void {
    if (!this.checkers.has(checkerId)) {
      throw new Error(`Checker with ID ${checkerId} not found`);
    }
    this.checkers.delete(checkerId);
  }

  /**
   * Get a runtime checker by ID
   */
  getChecker(checkerId: string): RuntimeChecker | undefined {
    return this.checkers.get(checkerId);
  }

  /**
   * Validate data using all registered checkers
   */
  async validate(
    context: ValidationContext,
    data: unknown,
    options?: ValidationOptions
  ): Promise<ValidationResult<ValidationError>> {
    // Run all checkers in sequence
    for (const checker of this.checkers.values()) {
      const result = await checker.check(context, data, options);
      if (!result.success) {
        return result;
      }
    }

    return {
      valid: true,
      success: true,
      errors: [],
      metadata: {
        duration: 0,
        timestamp: new Date().toISOString(),
        validator: 'RuntimeValidator'
      }
    };
  }
}
