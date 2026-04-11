import HTMLtoDOCX from 'html-to-docx';

async function run() {
  try {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial; }
        </style>
      </head>
      <body>
        <p w:rsidR="0000">Hello world</p>
      </body>
      </html>
    `;
    const buffer = await HTMLtoDOCX(html, null, { margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } });
    console.log("Success with w:rsidR");
  } catch (e: any) {
    console.error("Error with w:rsidR:", e.message);
  }
}
run();
