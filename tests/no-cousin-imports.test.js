const path = require("path");
const { RuleTester } = require("eslint");
const rule = require("../src/no-cousin-imports");

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: { ecmaVersion: 2020, sourceType: "module" },
  },
});

// Mock project structure for testing
const mockProjectRoot = "/mock/project";
const originalCwd = process.cwd;

// Helper to create absolute paths for testing
const createAbsolutePath = (relativePath) =>
  path.join(mockProjectRoot, relativePath);

describe("ESLint Rule: no-cousin-imports", () => {
  beforeAll(() => {
    process.cwd = () => mockProjectRoot;
  });

  afterAll(() => {
    process.cwd = originalCwd;
  });

  // Core ESLint rule tests
  ruleTester.run("no-cousin-imports", rule, {
    valid: [
      // No zones configured
      {
        code: "import { something } from '../cousin/module';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [{ _testProjectRoot: mockProjectRoot }],
      },

      // File outside configured zones
      {
        code: "import { something } from '../cousin/module';",
        filename: createAbsolutePath("outside/file.js"),
        options: [{ zones: [{ path: "src" }], _testProjectRoot: mockProjectRoot }],
      },

      // Same directory import
      {
        code: "import { something } from './sibling';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [{ zones: [{ path: "src" }], _testProjectRoot: mockProjectRoot }],
      },

      // Parent/child imports
      {
        code: "import { something } from '../parent';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [{ zones: [{ path: "src" }], _testProjectRoot: mockProjectRoot }],
      },
      {
        code: "import { something } from './child/module';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [{ zones: [{ path: "src" }], _testProjectRoot: mockProjectRoot }],
      },

      // Shared patterns - folder
      {
        code: "import { something } from '../shared/utils';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [
          {
            zones: [{ path: "src" }],
            sharedPatterns: [{ pattern: "shared", type: "folder" }],
            _testProjectRoot: mockProjectRoot,
          },
        ],
      },

      // Shared patterns - file
      {
        code: "import { something } from '../moduleB/constants';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [
          {
            zones: [{ path: "src" }],
            sharedPatterns: [{ pattern: "constants", type: "file" }],
            _testProjectRoot: mockProjectRoot,
          },
        ],
      },

      // Common ancestor is shared
      {
        code: "import { something } from '../moduleB/component';",
        filename: createAbsolutePath("src/modules/moduleA/file.js"),
        options: [
          {
            zones: [{ path: "src" }],
            sharedPatterns: [{ pattern: "modules", type: "folder" }],
            _testProjectRoot: mockProjectRoot,
          },
        ],
      },

      // External imports
      {
        code: "import { something } from 'lodash';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [{ zones: [{ path: "src" }], _testProjectRoot: mockProjectRoot }],
      },

      // Alias resolution - valid
      {
        code: "import { something } from '@/shared/utils';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [
          {
            zones: [{ path: "src" }],
            aliases: { "@/*": ["src/*"] },
            sharedPatterns: [{ pattern: "shared", type: "folder" }],
            _testProjectRoot: mockProjectRoot,
          },
        ],
      },
    ],

    invalid: [
      // Basic cousin import
      {
        code: "import { something } from '../moduleB/component';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [{ zones: [{ path: "src" }], _testProjectRoot: mockProjectRoot }],
        errors: [{ messageId: "noCousins" }],
      },

      // Deep nesting cousin import
      {
        code: "import { something } from '../../featureB/components/Button';",
        filename: createAbsolutePath("src/features/featureA/components/Input.js"),
        options: [{ zones: [{ path: "src" }], _testProjectRoot: mockProjectRoot }],
        errors: [{ messageId: "noCousins" }],
      },

      // Alias resolution - violation
      {
        code: "import { something } from '@/moduleB/component';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [
          {
            zones: [{ path: "src" }],
            aliases: { "@/*": ["src/*"] },
            _testProjectRoot: mockProjectRoot,
          },
        ],
        errors: [{ messageId: "noCousins" }],
      },

      // Shared pattern doesn't match
      {
        code: "import { something } from '../moduleB/component';",
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [
          {
            zones: [{ path: "src" }],
            sharedPatterns: [{ pattern: "shared", type: "folder" }],
            _testProjectRoot: mockProjectRoot,
          },
        ],
        errors: [{ messageId: "noCousins" }],
      },

      // Multiple zones
      {
        code: "import { something } from '../moduleB/component';",
        filename: createAbsolutePath("app/moduleA/file.js"),
        options: [{ zones: [{ path: "src" }, { path: "app" }], _testProjectRoot: mockProjectRoot }],
        errors: [{ messageId: "noCousins" }],
      },
    ],
  });

  // Special cases and edge conditions
  describe("Special Cases", () => {
    let mockContext;

    beforeEach(() => {
      mockContext = {
        filename: createAbsolutePath("src/moduleA/file.js"),
        options: [{ zones: [{ path: "src" }], _testProjectRoot: mockProjectRoot }],
        cwd: mockProjectRoot,
        report: jest.fn(),
      };
    });

    test("ignores TypeScript type imports", () => {
      const ruleInstance = rule.create(mockContext);
      const mockNode = {
        source: { value: "../moduleB/types" },
        importKind: "type",
      };

      ruleInstance.ImportDeclaration(mockNode);
      expect(mockContext.report).not.toHaveBeenCalled();
    });

    test("handles empty zones gracefully", () => {
      const emptyZonesContext = { ...mockContext, options: [{ zones: [], _testProjectRoot: mockProjectRoot }] };
      const emptyZonesRule = rule.create(emptyZonesContext);
      expect(emptyZonesRule).toEqual({});
    });

    test("handles files outside project zones", () => {
      const outsideContext = {
        ...mockContext,
        filename: "/outside/project/file.js",
      };
      const outsideRule = rule.create(outsideContext);
      const mockNode = { source: { value: "../other/component" } };

      outsideRule.ImportDeclaration(mockNode);
      expect(mockContext.report).not.toHaveBeenCalled();
    });

    test("handles complex alias configurations", () => {
      const aliasContext = {
        ...mockContext,
        options: [
          {
            zones: [{ path: "src" }],
            aliases: {
              "@/*": ["src/*"],
              "@utils": ["src/shared/utils"],
            },
            _testProjectRoot: mockProjectRoot,
          },
        ],
      };
      const aliasRule = rule.create(aliasContext);
      const mockNode = { source: { value: "@/moduleB/component" } };

      aliasRule.ImportDeclaration(mockNode);
      expect(mockContext.report).toHaveBeenCalledWith({
        node: mockNode,
        messageId: "noCousins",
        data: expect.objectContaining({
          importedRelative: "src/moduleB/component",
        }),
      });
    });
  });

  // Unit tests for core helper functions
  describe("Helper Functions", () => {
    const {
      resolveAliasedPath,
      getPathSegmentsRelativeToRoot,
      isPathInRuleZone,
      matchesSharedPattern,
      analyzeImportRelationship,
      generateViolationSuggestions,
      formatExistingSharedPatterns,
    } = rule.internals;

    describe("Path Resolution", () => {
      test("resolves relative paths", () => {
        const result = resolveAliasedPath(
          "./component",
          "/project/src/moduleA/file.js",
          {},
          "/project"
        );
        expect(result).toBe(path.resolve("/project/src/moduleA", "./component"));
      });

      test("resolves aliased paths", () => {
        const aliases = { "@/*": ["src/*"] };
        const result = resolveAliasedPath(
          "@/components/Button",
          "/project/src/moduleA/file.js",
          aliases,
          "/project"
        );
        expect(result).toBe(path.resolve("/project", "src/components/Button"));
      });

      test("handles multiple alias targets", () => {
        const aliases = { "@/*": ["src/*", "lib/*"] };
        const result = resolveAliasedPath(
          "@/component",
          "/project/test/file.js",
          aliases,
          "/project"
        );
        expect(result).toBe(path.resolve("/project", "src/component"));
      });
    });

    describe("Path Analysis", () => {
      test("segments paths correctly", () => {
        const result = getPathSegmentsRelativeToRoot(
          "/project/src/features/moduleA/file.js",
          "/project"
        );
        expect(result).toEqual(["src", "features", "moduleA", "file.js"]);
      });

      test("detects zone membership", () => {
        const zones = [{ path: "src" }];
        expect(isPathInRuleZone("/project/src/moduleA/file.js", zones, "/project")).toBe(true);
        expect(isPathInRuleZone("/project/lib/moduleA/file.js", zones, "/project")).toBe(false);
      });

      test("identifies cousin relationships", () => {
        const result = analyzeImportRelationship(
          "/project/src/moduleA/file.js",
          "/project/src/moduleB/component.js",
          "/project",
          []
        );
        expect(result.isCousin).toBe(true);
        expect(result.commonAncestorPathSegments).toEqual(["src"]);
      });
    });

    describe("Pattern Matching", () => {
      test("matches folder patterns", () => {
        const patterns = [{ pattern: "shared", type: "folder" }];
        expect(matchesSharedPattern(["shared", "utils"], patterns)).toBe(true);
        expect(matchesSharedPattern(["other", "utils"], patterns)).toBe(false);
      });

      test("matches file patterns from end", () => {
        const patterns = [{ pattern: "utils/helpers", type: "file" }];
        expect(matchesSharedPattern(["moduleA", "utils", "helpers"], patterns)).toBe(true);
        expect(matchesSharedPattern(["moduleA", "utils", "other"], patterns)).toBe(false);
      });

      test("uses pre-computed segments", () => {
        const patterns = [{ 
          pattern: "shared/utils", 
          type: "folder",
          _segments: ["shared", "utils"]
        }];
        expect(matchesSharedPattern(["shared", "utils", "file.js"], patterns)).toBe(true);
      });
    });

    describe("Message Generation", () => {
      test("generates violation suggestions", () => {
        const result = generateViolationSuggestions(["src"], ["moduleB", "component"]);
        expect(result).toContain("moduleB");
        expect(result).toContain("pattern");
      });

      test("formats empty shared patterns", () => {
        const result = formatExistingSharedPatterns([]);
        expect(result).toBe("     None configured.");
      });

      test("formats mixed patterns", () => {
        const patterns = [
          { pattern: "shared", type: "folder" },
          { pattern: "utils/helpers", type: "file" },
        ];
        const result = formatExistingSharedPatterns(patterns);
        expect(result).toContain("Folder patterns");
        expect(result).toContain("File patterns");
      });
    });
  });
});
