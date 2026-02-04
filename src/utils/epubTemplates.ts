import { escapeXml, htmlToXhtml } from './sanitizer';
import type { Article } from '../types';

// Container XML - points to the OPF file
export const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

/**
 * Generate content.opf (package metadata)
 */
export function generateContentOpf(params: {
  title: string;
  author: string;
  date: string;
  uuid: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(params.title)}</dc:title>
    <dc:creator>${escapeXml(params.author)}</dc:creator>
    <dc:date>${escapeXml(params.date)}</dc:date>
    <dc:identifier id="bookid">urn:uuid:${params.uuid}</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="content"/>
  </spine>
</package>`;
}

/**
 * Generate toc.ncx (navigation)
 */
export function generateTocNcx(params: {
  title: string;
  uuid: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${params.uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(params.title)}</text>
  </docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel>
        <text>${escapeXml(params.title)}</text>
      </navLabel>
      <content src="content.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;
}

/**
 * Generate content.xhtml (the actual article content)
 */
/**
 * Generate content.xhtml (the actual article content)
 */
export function generateContentXhtml(article: Article): string {
  const { title, author, date, body, sourceUrl } = article;

  // Build metadata line: Author • Date • Source
  const metaParts: string[] = [];
  if (author && author !== 'Unknown') metaParts.push(escapeXml(author));
  if (date && date !== 'Unknown') metaParts.push(escapeXml(date));
  if (sourceUrl) metaParts.push(`<a href="${escapeXml(sourceUrl)}">Source</a>`);

  const metaLine = metaParts.length > 0
    ? `<p class="meta">${metaParts.join(' • ')}</p>`
    : '';

  // Convert HTML body to XHTML (properly close self-closing tags)
  // Note: We do NOT strip images, matching the working Chrome extension behavior.
  const xhtmlBody = htmlToXhtml(body);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8"/>
  <title>${escapeXml(title)}</title>
  <style type="text/css">
    body {
      margin: 1.5em;
      line-height: 1.7;
      font-family: Georgia, "Times New Roman", serif;
    }
    h1 {
      font-size: 1.5em;
      margin-bottom: 0.3em;
      line-height: 1.3;
    }
    .meta {
      color: #666;
      font-size: 0.85em;
      margin-bottom: 1.5em;
      padding-bottom: 1em;
      border-bottom: 1px solid #ddd;
    }
    .meta a { color: #666; }
    p {
      margin: 0.9em 0;
      text-align: left;
    }
    blockquote {
      margin: 1em 1.5em;
      padding-left: 1em;
      border-left: 3px solid #ccc;
      font-style: italic;
    }
  </style>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  ${metaLine}
  <div class="content">
    ${xhtmlBody}
  </div>
</body>
</html>`;
}
