import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const plugins: any[] = [react()];

  if (process.env.REPORT || process.env.npm_config_report) {
    try {
      const dynamicImport: any = (m: string) => (new Function('m', 'return import(m)'))(m);
      const mod: any = await dynamicImport('rollup-plugin-visualizer');
      const visualizer = (mod && (mod.visualizer || mod.default)) as any;
      if (typeof visualizer === 'function') {
        plugins.push(visualizer({ filename: 'dist/report.html', open: false }));
      }
    } catch (e) {
      console.warn('rollup-plugin-visualizer not installed. Run: npm i -D rollup-plugin-visualizer');
    }
  }

  return {
    plugins,
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
