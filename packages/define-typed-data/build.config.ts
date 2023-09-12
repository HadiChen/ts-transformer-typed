import { defineBuildConfig } from 'unbuild';
import path from 'path';

export default defineBuildConfig({
  declaration: true,
  rollup: {
    inlineDependencies: true,
    emitCJS: true,
    esbuild: {
      target: 'ES2020',
      minify: true,
      sourcemap: true,
    },
    alias: {
      entries: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  },
  clean: true,
  entries: [
    'src/index',
    'src/interface-keys-transformer',
  ],
  externals: [
    'url',
    'buffer',
    'path',
    'child_process',
    'process',
    'os',
    'typescript',
  ],
});
