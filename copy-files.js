import fs from 'fs';

fs.copyFileSync('./App-2.tsx', 'src/App.tsx');
fs.mkdirSync('src/styles', { recursive: true });
fs.copyFileSync('src/index.css', 'src/styles/index.css'); // Move current index.css to styles/index.css
fs.copyFileSync('./main-2.tsx', 'src/main.tsx');
fs.copyFileSync('./queries-1.ts', 'src/lib/queries.ts');
fs.copyFileSync('./supabase-1.ts', 'src/lib/supabase.ts');

console.log('Files copied successfully.');
