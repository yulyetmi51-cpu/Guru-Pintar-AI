const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function run() {
  try {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          @media print {
            body { font-family: Arial; }
          }
        </style>
      </head>
      <body>
        <p>Hello world</p>
      </body>
      </html>
    `;
    const buffer = await HTMLtoDOCX(html, null, { margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } });
    console.log("Success with @media");
  } catch (e) {
    console.error("Error with @media:", e.message);
  }
}
run();
