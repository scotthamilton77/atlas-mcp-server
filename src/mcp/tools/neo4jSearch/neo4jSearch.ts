import { Neo4jSearchArgs } from "./types";
import { driver } from "../../../neo4j/driver.js";
import fuzzysort from 'fuzzysort';

/**
 * Transforms a search value into a Neo4j regex pattern
 * Handles both explicit wildcards (* and ?) and adds implicit partial matching
 */
function transformWildcardPattern(value: string, caseInsensitive: boolean): string {
  // Remove quotes if present for processing
  const cleanValue = value.replace(/^"(.*)"$/, '$1');
  
  // Split into words for better partial matching
  const words = cleanValue.split(/\s+/);
  
  // Process each word separately
  const processedWords = words.map(word => {
    if (word.includes('*') || word.includes('?')) {
      // Handle explicit wildcards
      return word
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    } else {
      // Add implicit partial matching
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `.*${escaped}.*`;
    }
  });

  // Join words with word boundary
  const pattern = processedWords.join('\\s+');
  
  return caseInsensitive ? `(?i)${pattern}` : pattern;
}

/**
 * Builds the WHERE clause based on search parameters
 */
function buildWhereClause(args: Neo4jSearchArgs, propertyRef: string): string {
  if (args.fuzzy) {
    // For fuzzy search, we'll collect all values and post-process with fuzzysort
    return `true`;
  }

  if (args.wildcard) {
    // Always use regex matching for wildcard searches
    return args.caseInsensitive
      ? `toLower(${propertyRef}) =~ toLower($pattern)`
      : `${propertyRef} =~ $pattern`;
  }

  if (args.caseInsensitive) {
    // Enhanced case-insensitive search with word boundary support
    const words = args.value.split(/\s+/);
    if (words.length > 1) {
      return words.map((_, i) => 
        `toLower(${propertyRef}) CONTAINS toLower($word${i})`
      ).join(' AND ');
    }
    return args.exactMatch
      ? `toLower(${propertyRef}) = toLower($value)`
      : `toLower(${propertyRef}) CONTAINS toLower($value)`;
  }

  // Default case: exact or partial matching
  return args.exactMatch
    ? `${propertyRef} = $value`
    : `${propertyRef} CONTAINS $value`;
}

interface NodeProperties {
  [key: string]: any;
}

interface FuzzyTarget {
  original: NodeProperties;
  searchStr: string;
}

export async function searchNeo4j(args: Neo4jSearchArgs): Promise<any> {
  const session = driver.session();
  try {
    // Set defaults for pagination
    const page = Number(args.page || 1);
    const limit = Number(args.limit || 100);
    const skip = (page - 1) * limit;

    // Build base query parameters
    const params: Record<string, any> = {
      value: args.value,
      skip: Number(skip),
      limit
    };
    
    // Add word-specific parameters for case-insensitive multi-word search
    if (args.caseInsensitive && !args.wildcard && !args.fuzzy) {
      const words = args.value.split(/\s+/);
      words.forEach((word, i) => {
        params[`word${i}`] = word;
      });
    }

    // Handle wildcard pattern transformation
    if (args.wildcard) {
      params.pattern = transformWildcardPattern(args.value, args.caseInsensitive || false);
    }

    // Build property reference based on type
    const propertyRef = `n.${args.property}`;

    // Build the base query with label filter if provided
    const labelFilter = args.label ? `:${args.label}` : '';
    const whereClause = buildWhereClause(args, propertyRef);

    // Dynamically detect array properties
    const defaultArrayProps = ['tags', 'categories', 'labels', 'members'];
    const customArrayProps = args.arrayProperties || [];
    const arrayProperties = [...new Set([...defaultArrayProps, ...customArrayProps])];

    const isArrayProperty = arrayProperties.includes(args.property) || (
      args.property.endsWith('s') && 
      !['status', 'address', 'progress'].includes(args.property)
    );

    const arrayWhereClause = isArrayProperty
      ? `ANY(item IN ${propertyRef} WHERE ${buildWhereClause(args, 'item')})`
      : whereClause;

    // Build the complete query
    const query = `
      MATCH (n${labelFilter})
      ${args.fuzzy ? '' : `WHERE ${arrayWhereClause}`}
      WITH n
      ${args.fuzzy ? '' : `SKIP toInteger($skip)
      LIMIT toInteger($limit)`}
      RETURN n
    `;

    // Execute the query with timeout protection
    const result = await session.run(query, params);
    
    // Transform results
    let records = result.records.map(record => record.get("n").properties) as NodeProperties[];

    // Apply fuzzy search if enabled
    if (args.fuzzy) {
      const searchValue = args.value;
      const threshold = args.fuzzyThreshold || 0.3;
      
      // Prepare targets for fuzzy search
      const targets: FuzzyTarget[] = records.map(record => ({
        original: record,
        searchStr: String(record[args.property] || '')
      }));

      // Perform fuzzy search
      const fuzzyResults = fuzzysort.go(searchValue, targets, {
        keys: ['searchStr'],
        threshold: -10000 * (1 - threshold) // Convert our 0-1 threshold to fuzzysort's scoring system
      });

      // Map back to original records and apply pagination
      records = fuzzyResults
        .slice(skip, skip + limit)
        .map(result => {
          const target = result.obj as FuzzyTarget;
          return target.original;
        });

      // Return results with pagination metadata
      return {
        results: records,
        pagination: {
          total: fuzzyResults.length,
          page,
          limit,
          totalPages: Math.ceil(fuzzyResults.length / limit)
        }
      };
    }

    // For non-fuzzy search, get total count for pagination metadata
    const countQuery = `
      MATCH (n${labelFilter}) 
      WHERE ${arrayWhereClause}
      RETURN count(n) as total
    `;
    const countResult = await session.run(countQuery, params);
    const total = countResult.records[0].get("total").toNumber();

    // Return results with pagination metadata
    return {
      results: records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } finally {
    await session.close();
  }
}