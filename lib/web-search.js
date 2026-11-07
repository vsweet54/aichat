/**
 * Lightweight Web Search Engine
 * Menggunakan DuckDuckGo HTML parsing tanpa butuh API key pihak ketiga
 */

async function performWebSearch(query, maxResults = 5) {
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return [];
  }

  try {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://html.duckduckgo.com/html/?q=${cleanQuery}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) {
      return fallbackInstantAnswer(query);
    }

    const html = await res.text();
    const results = [];

    // Parsing sederhana link dan snippet hasil DuckDuckGo HTML
    const regex = /<a class="result__url" href="([^"]+)">[\s\S]*?<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let match;

    while ((match = regex.exec(html)) !== null && results.length < maxResults) {
      let rawUrl = match[1];
      if (rawUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
        try {
          const urlParam = rawUrl.split('uddg=')[1].split('&')[0];
          rawUrl = decodeURIComponent(urlParam);
        } catch {
          // Tetap gunakan rawUrl
        }
      }

      const snippet = match[2]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();

      if (snippet) {
        results.push({
          title: query,
          snippet: snippet,
          link: rawUrl
        });
      }
    }

    if (results.length === 0) {
      return fallbackInstantAnswer(query);
    }

    return results;
  } catch (err) {
    console.warn('[WebSearch] Pencarian web gagal:', err.message);
    return fallbackInstantAnswer(query);
  }
}

async function fallbackInstantAnswer(query) {
  try {
    const cleanQuery = encodeURIComponent(query.trim());
    const res = await fetch(`https://api.duckduckgo.com/?q=${cleanQuery}&format=json&no_html=1&skip_disambig=1`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return [];

    const json = await res.json();
    const results = [];

    if (json.AbstractText) {
      results.push({
        title: json.Heading || query,
        snippet: json.AbstractText,
        link: json.AbstractURL || ''
      });
    }

    if (Array.isArray(json.RelatedTopics)) {
      for (const item of json.RelatedTopics.slice(0, 3)) {
        if (item.Text) {
          results.push({
            title: item.Text.slice(0, 50),
            snippet: item.Text,
            link: item.FirstURL || ''
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

module.exports = {
  performWebSearch
};
