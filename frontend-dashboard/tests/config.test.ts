import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Helper to parse JSON with comments (JSONC) - strips comments before parsing
function parseJsonc(content: string): unknown {
  // Remove single-line comments (but not inside strings)
  let result = '';
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (escape) {
      result += char;
      escape = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      result += char;
      escape = true;
      continue;
    }
    
    if (char === '"' && !escape) {
      inString = !inString;
      result += char;
      continue;
    }
    
    if (!inString && char === '/' && nextChar === '/') {
      // Skip to end of line
      while (i < content.length && content[i] !== '\n') {
        i++;
      }
      result += '\n';
      continue;
    }
    
    if (!inString && char === '/' && nextChar === '*') {
      // Skip to end of block comment
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) {
        i++;
      }
      i++; // Skip the closing /
      continue;
    }
    
    result += char;
  }
  
  return JSON.parse(result);
}

describe('Project Configuration', () => {
  const projectRoot = path.resolve(__dirname, '..');

  describe('package.json', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')
    );

    it('has correct project name', () => {
      expect(packageJson.name).toBe('oblak-frontend-dashboard');
    });

    it('has React 18 as dependency', () => {
      expect(packageJson.dependencies.react).toMatch(/^[\^~]?18/);
    });

    it('has React DOM as dependency', () => {
      expect(packageJson.dependencies['react-dom']).toMatch(/^[\^~]?18/);
    });

    it('has Vite as dev dependency', () => {
      expect(packageJson.devDependencies.vite).toBeDefined();
    });

    it('has TypeScript as dev dependency', () => {
      expect(packageJson.devDependencies.typescript).toBeDefined();
    });

    it('has Tailwind CSS as dev dependency', () => {
      expect(packageJson.devDependencies.tailwindcss).toBeDefined();
    });

    it('has required scripts', () => {
      expect(packageJson.scripts.dev).toBeDefined();
      expect(packageJson.scripts.build).toBeDefined();
      expect(packageJson.scripts.test).toBeDefined();
    });
  });

  describe('tsconfig.json', () => {
    const tsconfig = parseJsonc(
      fs.readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf-8')
    ) as { compilerOptions: { paths?: Record<string, string[]>; strict?: boolean; jsx?: string } };

    it('has path alias configured', () => {
      expect(tsconfig.compilerOptions.paths?.['@/*']).toEqual(['./src/*']);
    });

    it('has strict mode enabled', () => {
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it('uses react-jsx for JSX transform', () => {
      expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    });
  });

  describe('Tailwind configuration', () => {
    it('tailwind.config.js exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'tailwind.config.js'))).toBe(true);
    });

    it('postcss.config.js exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'postcss.config.js'))).toBe(true);
    });
  });

  describe('Vite configuration', () => {
    it('vite.config.ts exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'vite.config.ts'))).toBe(true);
    });
  });

  describe('Docker files', () => {
    it('Dockerfile exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'Dockerfile'))).toBe(true);
    });

    it('Dockerfile.dev exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'Dockerfile.dev'))).toBe(true);
    });

    it('nginx.conf exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'nginx.conf'))).toBe(true);
    });
  });

  describe('Source files', () => {
    it('index.html exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'index.html'))).toBe(true);
    });

    it('src/main.tsx exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'src/main.tsx'))).toBe(true);
    });

    it('src/App.tsx exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'src/App.tsx'))).toBe(true);
    });

    it('src/index.css exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'src/index.css'))).toBe(true);
    });

    it('src/lib/utils.ts exists', () => {
      expect(fs.existsSync(path.join(projectRoot, 'src/lib/utils.ts'))).toBe(true);
    });
  });
});
