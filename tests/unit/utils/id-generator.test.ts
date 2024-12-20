import { generateShortId, isValidShortId, generateTestId, ID_CONSTANTS } from '../../../src/utils/id-generator';

describe('ID Generator', () => {
    describe('generateShortId', () => {
        it('generates IDs of correct length', () => {
            const id = generateShortId();
            expect(id.length).toBe(ID_CONSTANTS.LENGTH);
        });

        it('generates IDs with valid characters', () => {
            const id = generateShortId();
            expect(isValidShortId(id)).toBe(true);
        });

        it('generates unique IDs', () => {
            const ids = new Set();
            // Generate 10,000 IDs and check for collisions
            for (let i = 0; i < 10000; i++) {
                const id = generateShortId();
                expect(ids.has(id)).toBe(false);
                ids.add(id);
            }
        });

        it('generates IDs with good distribution', () => {
            const charCounts: { [key: string]: number } = {};
            const numIds = 10000;
            
            // Generate IDs and count character occurrences
            for (let i = 0; i < numIds; i++) {
                const id = generateShortId();
                for (const char of id) {
                    charCounts[char] = (charCounts[char] || 0) + 1;
                }
            }

            // Calculate expected count per character
            const totalChars = numIds * ID_CONSTANTS.LENGTH;
            const expectedCount = totalChars / ID_CONSTANTS.ALPHABET.length;
            const tolerance = expectedCount * 0.2; // Allow 20% deviation

            // Verify character distribution
            for (const char of ID_CONSTANTS.ALPHABET) {
                const count = charCounts[char] || 0;
                expect(count).toBeGreaterThanOrEqual(expectedCount - tolerance);
                expect(count).toBeLessThanOrEqual(expectedCount + tolerance);
            }
        });
    });

    describe('isValidShortId', () => {
        it('validates correct IDs', () => {
            expect(isValidShortId(generateShortId())).toBe(true);
        });

        it('rejects invalid IDs', () => {
            expect(isValidShortId('')).toBe(false);
            expect(isValidShortId('short')).toBe(false);
            expect(isValidShortId('toolong12')).toBe(false);
            expect(isValidShortId('invalid!')).toBe(false);
            expect(isValidShortId('ABCD-123')).toBe(false);
        });
    });

    describe('generateTestId', () => {
        it('generates deterministic IDs', () => {
            expect(generateTestId('ts', 1)).toBe('ts000001');
            expect(generateTestId('ts', 1)).toBe('ts000001');
        });

        it('handles different prefixes', () => {
            expect(generateTestId('ab', 1)).toBe('ab000001');
            expect(generateTestId('xy', 1)).toBe('xy000001');
        });

        it('handles sequence numbers correctly', () => {
            expect(generateTestId('ts', 0)).toBe('ts000000');
            expect(generateTestId('ts', 999999)).toBe('ts999999');
        });

        it('truncates to correct length', () => {
            const id = generateTestId('test', 123);
            expect(id.length).toBe(ID_CONSTANTS.LENGTH);
        });
    });

    describe('collision probability simulation', () => {
        it('demonstrates low collision probability', () => {
            const numIds = 10000;
            const trials = 100;
            let totalCollisions = 0;

            // Run multiple trials
            for (let trial = 0; trial < trials; trial++) {
                const ids = new Set();
                let collisions = 0;

                // Generate IDs and count collisions
                for (let i = 0; i < numIds; i++) {
                    const id = generateShortId();
                    if (ids.has(id)) {
                        collisions++;
                    }
                    ids.add(id);
                }

                totalCollisions += collisions;
            }

            // Calculate average collisions per trial
            const avgCollisions = totalCollisions / trials;
            
            // With 62^8 possible combinations, expect near-zero collisions
            // in 10,000 IDs (probability ~2.3e-7 per pair)
            expect(avgCollisions).toBeLessThan(1);
        });
    });
});
