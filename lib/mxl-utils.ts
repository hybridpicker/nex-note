import JSZip from 'jszip';

export interface MxlData {
  xml: string;
  filename: string;
  meta?: Record<string, string>;
}

export async function extractXmlFromMxl(buffer: Buffer): Promise<MxlData> {
  const zip = await JSZip.loadAsync(buffer);

  // Find container.xml to locate root file
  const containerFile = zip.file('META-INF/container.xml');
  let rootFile = 'score.xml';

  if (containerFile) {
    const containerXml = await containerFile.async('string');
    const match = containerXml.match(/full-path="([^"]+\.xml)"/);
    if (match) rootFile = match[1];
  }

  const xmlFile = zip.file(rootFile);
  if (!xmlFile) {
    // Fallback: find any .xml file
    const xmlFiles = Object.keys(zip.files).filter((f) => f.endsWith('.xml') && !f.startsWith('META-INF'));
    if (xmlFiles.length === 0) throw new Error('No XML file found in MXL archive');
    const fallback = zip.file(xmlFiles[0]);
    if (!fallback) throw new Error('Could not read XML file');
    const xml = await fallback.async('string');
    return { xml, filename: xmlFiles[0] };
  }

  const xml = await xmlFile.async('string');
  return { xml, filename: rootFile };
}

export async function packXmlToMxl(xml: string, filename: string = 'score.xml'): Promise<Buffer> {
  const zip = new JSZip();

  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="${filename}" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`);

  zip.file(filename, xml);

  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return content;
}

export function xmlToBase64(xml: string): string {
  return Buffer.from(xml, 'utf-8').toString('base64');
}
