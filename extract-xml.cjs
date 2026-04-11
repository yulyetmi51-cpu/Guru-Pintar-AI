
const JSZip = require('jszip');
const fs = require('fs');

async function extract() {
    const data = fs.readFileSync('test-lh.docx');
    const zip = await JSZip.loadAsync(data);
    const xml = await zip.file('word/document.xml').async('string');
    console.log(xml);
}

extract();
