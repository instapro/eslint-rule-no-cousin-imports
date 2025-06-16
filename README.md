# ESLint Rule: no-cousin-imports

An ESLint rule that prevents "cousin imports" between sibling directory trees, helping maintain clean modular architecture by enforcing module boundaries.

## What are Cousin Imports?

Cousin imports are imports between modules in sibling directories - horizontal dependencies that can make code harder to maintain and refactor.

```text
src/
├── moduleA/
│   └── file.js          // 👈 Importing from here
└── moduleB/
    └── component.js     // 👈 Into here (cousin import ❌)
```

## Why Prevent Them?

- **Better Architecture**: Encourages vertical (hierarchical) rather than horizontal dependencies
- **Easier Refactoring**: Modules become more self-contained and portable  
- **Clearer Boundaries**: Enforces logical separation between feature modules
- **Shared Code Patterns**: Forces you to think about where shared code should live

## Installation & Usage

### 1. Copy the Rule File

Currently distributed as source code. **Making this an npm package is on the roadmap.**

```bash
# Copy the rule file to your project
mkdir -p eslint-rules
curl -o eslint-rules/no-cousin-imports.js https://raw.githubusercontent.com/instapro/eslint-rule-no-cousin-imports/main/src/no-cousin-imports.js
```

Or if you already have a custom ESLint rules directory, you can place the file there.

### 2. Configure ESLint

#### ESLint Flat Config (ESLint 9+)

```javascript
// eslint.config.mjs
import noCousinsRule from './eslint-rules/no-cousin-imports.js';

export default [
  {
    plugins: {
      'local': {
        rules: {
          'no-cousin-imports': noCousinsRule
        }
      }
    },
    rules: {
      'local/no-cousin-imports': ['error', {
        zones: [{ path: 'src' }],
        sharedPatterns: [
          { pattern: 'shared', type: 'folder' },
          { pattern: 'constants', type: 'file' }
        ],
        aliases: {
          '@/*': ['src/*']
        }
      }]
    }
  }
];
```

#### Legacy ESLint Config

```javascript
// .eslintrc.js
const noCousinsRule = require('./eslint-rules/no-cousin-imports.js');

module.exports = {
  plugins: ['local'],
  rules: {
    'local/no-cousin-imports': ['error', {
      zones: [{ path: 'src' }],
      sharedPatterns: [
        { pattern: 'shared', type: 'folder' }
      ]
    }]
  }
};
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `zones` | `Array<{path: string}>` | ✅ | Directories where the rule applies |
| `sharedPatterns` | `Array<{pattern: string, type: 'folder'\|'file'}>` | ❌ | Patterns that are allowed as exceptions |
| `aliases` | `Object` | ❌ | Path aliases (e.g., `{'@/*': ['src/*']}`) |

### Zones

Define where the rule should be enforced:

```javascript
zones: [
  { path: 'src' },           // Apply to all files under src/
  { path: 'app/features' },  // Apply to files under app/features/
  { path: '.' }              // Apply to entire project
]
```

### Shared Patterns

Define exceptions for shared code:

```javascript
sharedPatterns: [
  { pattern: 'shared', type: 'folder' },         // Allow imports from any 'shared' folder
  { pattern: 'utils/helpers.ts', type: 'file' }, // Allow imports from 'utils/helpers.ts' files
  { pattern: 'constants.js', type: 'file' }      // Allow imports from any 'constants.js' file
]
```

- **`folder` type**: Matches directory names anywhere in the import path
- **`file` type**: Matches file paths from the end of the path

### Aliases

Support for path aliases:

```javascript
aliases: {
  '@/*': ['src/*'],
  '@components/*': ['src/components/*']
}
```

## Examples

### ❌ Invalid (Cousin Imports)

```javascript
// src/moduleA/file.js
import { Component } from '../moduleB/component';    // Cousin import
import { helper } from '../../features/auth/utils';  // Cousin import  
import { config } from '@/moduleC/config';           // Cousin import via alias
```

### ✅ Valid Alternatives

```javascript
// src/moduleA/file.js
import { Component } from './localComponent';        // Same directory
import { helper } from '../shared/utils';            // Shared utility (allowed pattern)
import { config } from '../config';                  // Parent directory
import { API } from './api/client';                  // Child directory
import { external } from 'lodash';                   // External package
```

## Real-World Example

**Project Structure:**

```text
src/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   └── services/
│   ├── dashboard/
│   │   ├── components/
│   │   └── services/
│   └── profile/
├── shared/
│   ├── components/
│   ├── utils/
│   └── constants/
└── types/
```

**Configuration:**

```javascript
{
  zones: [{ path: 'src' }],
  sharedPatterns: [
    { pattern: 'shared', type: 'folder' },
    { pattern: 'types', type: 'folder' },
    { pattern: 'constants', type: 'file' }
  ],
  aliases: {
    '@/*': ['src/*']
  }
}
```

**This prevents:**

- `features/auth/` importing from `features/dashboard/` (cousin import)
- `features/profile/` importing from `features/auth/` (cousin import)

**But allows:**

- Any feature importing from `shared/` directory
- Any feature importing from `types/` directory
- Imports within the same feature directory tree

## TypeScript Support

Works with TypeScript files. Type-only imports are ignored by default:

```typescript
// ✅ Type-only imports are ignored
import type { UserType } from '../moduleB/types';

// ❌ Regular imports are still checked  
import { UserService } from '../moduleB/services';
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Maintained by [Instapro Group](https://github.com/instapro)**
