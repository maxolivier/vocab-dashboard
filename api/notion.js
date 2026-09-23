const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });
function richText(arr) { return (arr || []).map(r => r.plain_text || '').join(''); }
async function getAllBlocks(blockId) {
  const blocks = []; let cursor;
  do {
    const resp = await notion.blocks.children.list({ block_id: blockId, page_size: 100, start_cursor: cursor });
    blocks.push(...resp.results); cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return blocks;
}
async function fetchPageContent(pageId) {
  const blocks = await getAllBlocks(pageId); let text = '';
  for (const block of blocks) {
    if (block.type === 'child_page') {
      const hexId = block.id.replace(/-/g, '');
      text += `<page url="https://app.notion.com/p/${hexId}">${block.child_page.title || ''}</page>\n`;
    } else if (block.type === 'table') {
      const rows = await getAllBlocks(block.id);
      for (const row of rows) {
        if (row.type === 'table_row') {
          const cells = (row.table_row.cells || []).map(cell => cell.map(r => r.plain_text || '').join(''));
          text += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>\n';
        }
      }
    }
  }
  return text;
}
async function queryDatabase(databaseId, startCursor) {
  const args = { database_id: databaseId, page_size: 100 };
  if (startCursor) args.start_cursor = startCursor;
  const resp = await notion.databases.query(args);
  const pages = resp.results.map(page => {
    const p = page.properties || {};
    return { id: page.id, url: page.url, properties: {
      Word: richText(p.Word?.title), English: richText(p.English?.rich_text),
      Attempts: p.Attempts?.number ?? 0, Misses: p.Misses?.number ?? 0 }};
  });
  return { pages, has_more: resp.has_more, next_cursor: resp.next_cursor || null };
}
async function createPages(databaseId, items) {
  const created = [];
  for (const item of items) {
    const today = new Date().toISOString().split('T')[0];
    const page = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Word: { title: [{ text: { content: item.Word || '' } }] },
        English: { rich_text: [{ text: { content: item.English || '' } }] },
        Attempts: { number: item.Attempts || 0 }, Misses: { number: item.Misses || 0 },
        'Last Tested': { date: { start: item['Last Tested'] || today } },
      },
    });
    created.push({ id: page.id, url: page.url, properties: { Word: item.Word, English: item.English, Attempts: item.Attempts, Misses: item.Misses } });
  }
  return { pages: created };
}
async function updatePage(pageId, properties) {
  const notionProps = {};
  if (properties.Attempts !== undefined) notionProps.Attempts = { number: properties.Attempts };
  if (properties.Misses !== undefined) notionProps.Misses = { number: properties.Misses };
  if (properties['Last Tested']) notionProps['Last Tested'] = { date: { start: properties['Last Tested'] } };
  await notion.pages.update({ page_id: pageId, properties: notionProps });
  return { success: true };
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { tool, ...args } = req.body || {};
  try {
    let result;
    switch (tool) {
      case 'fetch': result = { text: await fetchPageContent(args.id) }; break;
      case 'query-db': result = await queryDatabase(args.databaseId, args.cursor || undefined); break;
      case 'create-pages': result = await createPages(args.databaseId, args.pages || []); break;
      case 'update-page': result = await updatePage(args.pageId, args.properties || {}); break;
      default: return res.status(400).json({ error: 'Unknown tool: ' + tool });
    }
    res.json(result);
  } catch (err) { console.error('[notion]', err.message); res.status(500).json({ error: err.message }); }
};