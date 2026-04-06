import fs from 'fs';
const path = './src/services/geminiService.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replaceAll('text-align: justify;', 'text-align: left;');
content = content.replaceAll('line-height: 1.5;', 'line-height: 1.15;');
content = content.replaceAll('rata kanan-kiri/justify', 'rata kiri/left');
fs.writeFileSync(path, content);
console.log('Done');
