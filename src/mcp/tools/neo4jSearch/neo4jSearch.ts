import { Neo4jSearchArgs } from "./types";
import { driver } from "../../../neo4j/driver.js";
import fuzzysort from 'fuzzysort';
import { logger } from "../../../utils/logger.js";

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
    let skip = (page - 1) * limit;

    // For fuzzy search, we'll need to fetch more records for post-processing
    const fuzzyQueryLimit = args.fuzzy ? Math.min(10000, limit * 100) : limit;

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
      LIMIT toInteger($limit)`} ${args.fuzzy ? `LIMIT ${fuzzyQueryLimit}` : ''}
      RETURN n
    `;

    // Execute the query with timeout protection
    const result = await session.run(query, params);
    
    // Transform results
    let records = result.records.map(record => record.get("n").properties) as NodeProperties[];

    // Apply fuzzy search if enabled
    if (args.fuzzy) {
      const searchValue = args.value;
      // Use documented default threshold of 0.5
      const threshold = args.fuzzyThreshold || 0.5;

      logger.debug(`Performing fuzzy search for "${searchValue}" with threshold ${threshold} on ${records.length} records`);
      
      // Prepare targets for fuzzy search - extract searchable strings
      const searchStrings: string[] = records.map(record => {
        let searchStr: string;
        
        // Handle different property types including arrays
        const propValue = record[args.property];
        if (Array.isArray(propValue)) {
          // For array properties, join values for better fuzzy matching
          searchStr = propValue.map(item => String(item || '')).join(' ');
        } else if (typeof propValue === 'object' && propValue !== null) {
          // For object properties, stringify for matching
          searchStr = JSON.stringify(propValue);
        } else {
          // For simple values, convert to string
          searchStr = String(propValue || '');
        }
        
        return searchStr.trim();
      });
      
      // Map between search strings and original records
      const recordMap = new Map<string, NodeProperties>();
      searchStrings.forEach((str, i) => {
        recordMap.set(str, records[i]);
      });

      // Calculate threshold based on our 0-1 scale (convert to fuzzysort's scale)
      const fuzzyThreshold = -100 * (1 - threshold);
      
      // Perform fuzzy search directly on string array (simpler than object search)
      const fuzzyResults = fuzzysort.go(searchValue, searchStrings, {
        threshold: fuzzyThreshold
      });

      // If no results found with primary threshold, try a more lenient approach
      let finalResults = fuzzyResults;
      if (fuzzyResults.length === 0 && searchStrings.length > 0) {
        logger.debug("No fuzzy results found, trying more lenient approach");
        
        // Try a more lenient threshold for fuzzy matching
        const lenientResults = fuzzysort.go(searchValue, searchStrings, {
          threshold: -1000 // Very lenient threshold
        });
        
        logger.debug(`Lenient approach found ${lenientResults.length} potential matches`);
        finalResults = lenientResults;
      }

      // Map back to original records and apply pagination
      records = finalResults
        .slice(skip, skip + limit)
        .map(result => recordMap.get(result.target) || {} as NodeProperties);

      // Log debug info for fuzzy matching
      logger.debug(`Fuzzy search for "${searchValue}" with threshold ${threshold} found ${finalResults.length} matches.`);
      if (finalResults.length === 0 && searchStrings.length > 0) {
        logger.debug(`First 3 target values: ${searchStrings.slice(0, 3).map(s => `"${s}"`).join(', ')}`);
      }
      logger.debug(`Returning ${records.length} results after pagination`);

      // Return results with pagination metadata
      return {
        results: records,
        pagination: {
          total: finalResults.length,
          page,
          limit,
          totalPages: Math.ceil(finalResults.length / limit)
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