import esbuild from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWatch = process.argv.includes('--watch');

async function copyStaticFiles() {
  const files = ['manifest.json', 'popup.html', 'popup.css'];
  for (const file of files) {
    const srcPath = path.join(__dirname, file);
    const destPath = path.join(__dirname, 'dist', file);
    try {
      await fs.copyFile(srcPath, destPath);
      console.log(`✓ Copied ${file} to dist/`);
    } catch (err) {
      console.error(`✗ Error copying ${file}:`, err);
      process.exit(1);
    }
  }
}

async function run() {
  const distDir = path.join(__dirname, 'dist');
  
  // Ensure dist directory exists
  await fs.mkdir(distDir, { recursive: true });
  
  // Copy manifest, HTML, and CSS
  await copyStaticFiles();

  // Create esbuild compilation context
  const ctx = await esbuild.context({
    entryPoints: [
      path.join(__dirname, 'src/popup.ts'),
      path.join(__dirname, 'src/content.ts')
    ],
    bundle: true,
    outdir: distDir,
    platform: 'browser',
    target: 'chrome100',
    sourcemap: true,
    logLevel: 'info',
  });

  if (isWatch) {
    console.log('Watching files for changes...');
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('✓ Build completed successfully.');
  }
}

run().catch((err) => {
  console.error('✗ Build failed:', err);
  process.exit(1);
});
