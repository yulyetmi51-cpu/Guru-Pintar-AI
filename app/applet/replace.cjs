const fs = require('fs');
const path = './src/services/geminiService.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/text-align: justify;/g, 'text-align: left;');
content = content.replace(/line-height: 1\.5;/g, 'line-height: 1.15;');
content = content.replace(/rata kanan-kiri\/justify/g, 'rata kiri/left');
fs.writeFileSync(path, content);
console.log('Done');
