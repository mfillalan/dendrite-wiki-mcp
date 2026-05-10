declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

// Side-effect CSS imports (e.g., `import './styles/retro.css'` in
// `theme/index.ts`) need a module declaration so `tsc` doesn't reject
// the import path. Vite handles the actual asset.
declare module '*.css';
