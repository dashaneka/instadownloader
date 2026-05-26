const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const child_process = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Common headers for scraping
const scrapeHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -------------------------------------------------------------
// SAVEINSTA SCRAPER HELPERS
// -------------------------------------------------------------
function parseSaveInstaHtml(html) {
  const $ = cheerio.load(html);
  const result = {
    results_images: 0,
    results_videos: 0,
    images: [],
    videos: []
  };

  $('ul.download-box li').each((i, el) => {
    const li = $(el);
    
    // Extract thumbnail
    const imgNode = li.find('.download-items__thumb img');
    let thumb = imgNode.attr('src');
    const dataSrc = imgNode.attr('data-src');
    if (!thumb || thumb === '/imgs/loader.gif') {
      thumb = dataSrc || thumb;
    }

    // Determine if video or image
    const iconNode = li.find('.download-items__thumb i');
    const iconClass = iconNode.attr('class') || '';
    let isImage = iconClass.includes('icon-dlimage') || iconNode.attr('icon-dlimage') !== undefined;
    let isVideo = iconClass.includes('icon-dlvideo') || iconNode.attr('icon-dlvideo') !== undefined;

    // Find links
    const btnLinks = li.find('.download-items__btn a');
    let videoHref = null;

    btnLinks.each((j, linkEl) => {
      const a = $(linkEl);
      if (a.attr('video') !== undefined) {
        videoHref = a.attr('href');
        isVideo = true;
      }
      const textContent = a.text().toLowerCase();
      if (textContent.includes('download video')) {
        videoHref = a.attr('href');
        isVideo = true;
      }
    });

    if (isVideo && !videoHref && btnLinks.length > 0) {
      videoHref = btnLinks.first().attr('href');
    }

    // Resolutions
    const resolutions = [];
    li.find('.photo-option select option').each((j, optEl) => {
      const option = $(optEl);
      const resName = option.text().trim();
      const resVal = option.attr('value');
      if (resVal) {
        resolutions.push({ [resName]: resVal });
      }
    });

    if (resolutions.length > 0 && !videoHref) {
      isImage = true;
    }

    if (!isImage && !isVideo && btnLinks.length > 0) {
      const href = btnLinks.first().attr('href') || '';
      if (href.includes('.mp4') || href.includes('video')) {
        isVideo = true;
        videoHref = href;
      } else {
        isImage = true;
      }
    }

    if (isVideo) {
      result.results_videos++;
      result.videos.push({
        thumb_url: thumb,
        video_src: videoHref,
        resolutions_count: resolutions.length,
        resolution: resolutions
      });
    } else {
      result.results_images++;
      if (resolutions.length === 0 && btnLinks.length > 0) {
        const href = btnLinks.first().attr('href');
        if (href) {
          resolutions.push({ 'Original': href });
        }
      }
      result.images.push({
        thumb_url: thumb,
        resolutions_count: resolutions.length,
        resolution: resolutions
      });
    }
  });

  return result;
}

async function fetchFromSaveInsta(instagramUrl) {
  // Step 1: Fetch highlights page for tokens
  const pageRes = await axios.get('https://saveinsta.to/en/highlights', {
    headers: {
      ...scrapeHeaders,
      'Referer': 'https://www.google.com/',
    }
  });

  const pageHtml = pageRes.data;
  const scriptMatch = pageHtml.match(/<script[^>]*>\s*var\s+k_url_search\s*=\s*"[^"]+"([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    throw new Error('SaveInsta token block not found on index page.');
  }

  const scriptBlock = scriptMatch[1];
  const k_exp = scriptBlock.match(/k_exp\s*=\s*"([^"]+)"/)?.[1];
  const k_token = scriptBlock.match(/k_token\s*=\s*"([^"]+)"/)?.[1];

  if (!k_exp || !k_token) {
    throw new Error('SaveInsta extraction tokens expired or not found.');
  }

  await delay(1200);

  // Step 2: Request verify token
  const verifyRes = await axios.post('https://saveinsta.to/api/userverify', new URLSearchParams({
    url: instagramUrl
  }).toString(), {
    headers: {
      ...scrapeHeaders,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': 'https://saveinsta.to',
      'Referer': 'https://saveinsta.to/en/video',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  const cftoken = verifyRes.data?.token;
  if (!cftoken) {
    throw new Error('SaveInsta Cloudflare protection token verify failed.');
  }

  await delay(1200);

  // Step 3: Fetch ajax media download links
  const searchRes = await axios.post('https://saveinsta.to/api/ajaxSearch', new URLSearchParams({
    k_exp: k_exp,
    k_token: k_token,
    q: instagramUrl,
    t: 'media',
    lang: 'en',
    v: 'v2',
    cftoken: cftoken
  }).toString(), {
    headers: {
      ...scrapeHeaders,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': 'https://saveinsta.to',
      'Referer': 'https://saveinsta.to/en/highlights',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  const searchData = searchRes.data;
  if (searchData.status !== 'ok' || !searchData.data) {
    if (searchData.mess) {
      throw new Error(searchData.mess.replace(/<[^>]*>/g, ''));
    }
    throw new Error('SaveInsta API did not return media links.');
  }

  const parsed = parseSaveInstaHtml(searchData.data);
  return formatSaveInstaResult(parsed);
}

function formatSaveInstaResult(parsed) {
  const mediaList = [];
  
  if (parsed.videos && parsed.videos.length > 0) {
    parsed.videos.forEach((video, index) => {
      mediaList.push({
        type: 'video',
        url: video.video_src,
        thumbnail: video.thumb_url || null,
        filename: `instagram-video-${index + 1}`
      });
    });
  }
  
  if (parsed.images && parsed.images.length > 0) {
    parsed.images.forEach((image, index) => {
      let bestUrl = null;
      if (image.resolution && image.resolution.length > 0) {
        for (const resObj of image.resolution) {
          const key = Object.keys(resObj)[0];
          if (resObj[key]) {
            bestUrl = resObj[key];
            break;
          }
        }
      }
      if (!bestUrl) {
        bestUrl = image.thumb_url;
      }
      mediaList.push({
        type: 'image',
        url: bestUrl,
        thumbnail: image.thumb_url || null,
        filename: `instagram-image-${index + 1}`
      });
    });
  }
  
  if (mediaList.length === 0) {
    throw new Error('No media elements found in the scraped content.');
  }

  return {
    title: 'Instagram Media Download',
    thumbnail: mediaList[0]?.thumbnail || null,
    media: mediaList
  };
}

// -------------------------------------------------------------
// YT-DLP RUNNER & FORMATTERS
// -------------------------------------------------------------
function runYtdlp(url, cookiesFrom) {
  return new Promise((resolve, reject) => {
    let args = ['-j', url];
    
    if (cookiesFrom === 'chrome') {
      args.push('--cookies-from-browser', 'chrome');
    } else if (cookiesFrom === 'brave') {
      // Look for standard or Flatpak Brave path
      const flatpakBrave = `/home/rajnish/.var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser/Default`;
      args.push('--cookies-from-browser', `brave:${flatpakBrave}`);
    } else if (cookiesFrom === 'firefox') {
      args.push('--cookies-from-browser', 'firefox');
    }
    
    // Add extra params to run quickly
    args.push('--no-warnings', '--no-playlist');

    const proc = child_process.spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);
    
    proc.on('close', code => {
      if (code !== 0) {
        const errorMsg = stderr.trim() || `yt-dlp process exited with code ${code}`;
        return reject(new Error(errorMsg));
      }
      
      try {
        const lines = stdout.trim().split('\n').filter(Boolean);
        const results = lines.map(line => JSON.parse(line));
        resolve(results);
      } catch (e) {
        reject(new Error(`Failed to parse metadata: ${e.message}`));
      }
    });
  });
}

function formatYtdlpResults(results) {
  const mediaList = [];
  
  results.forEach((item, index) => {
    // If it's a playlist or multiple formats
    if (item.entries && Array.isArray(item.entries)) {
      item.entries.forEach((entry, subIndex) => {
        const isVideo = entry.vcodec !== 'none' || entry.ext === 'mp4' || entry.url?.includes('.mp4');
        mediaList.push({
          type: isVideo ? 'video' : 'image',
          url: entry.url,
          thumbnail: entry.thumbnail || entry.thumbnails?.[0]?.url || null,
          filename: `instagram-media-${index + subIndex + 1}`
        });
      });
    } else {
      const isVideo = item.vcodec !== 'none' || item.ext === 'mp4' || item.url?.includes('.mp4');
      mediaList.push({
        type: isVideo ? 'video' : 'image',
        url: item.url,
        thumbnail: item.thumbnail || item.thumbnails?.[0]?.url || null,
        filename: `instagram-media-${index + 1}`
      });
    }
  });
  
  if (mediaList.length === 0) {
    throw new Error('No media links found in the metadata.');
  }

  return {
    title: results[0]?.title || results[0]?.description || 'Instagram Media Download',
    thumbnail: results[0]?.thumbnail || mediaList[0]?.thumbnail || null,
    media: mediaList
  };
}

// -------------------------------------------------------------
// EXPRESS ROUTE ENDPOINTS
// -------------------------------------------------------------

// Main Route to fetch download links
app.get('/api/download-info', async (req, res) => {
  const targetUrl = req.query.url;
  const cookiesFrom = req.query.cookiesFrom || 'none';
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing Instagram URL parameter.' });
  }
  
  console.log(`\n--- Request received for: ${targetUrl} [Cookies: ${cookiesFrom}] ---`);

  // Scenario A: User wants browser cookies session
  if (cookiesFrom !== 'none') {
    try {
      console.log(`Running yt-dlp with cookies session: ${cookiesFrom}...`);
      const ytdlResults = await runYtdlp(targetUrl, cookiesFrom);
      const formatted = formatYtdlpResults(ytdlResults);
      return res.json({ success: true, provider: `yt-dlp (${cookiesFrom})`, data: formatted });
    } catch (err) {
      console.error(`yt-dlp cookies failed:`, err.message);
      return res.status(500).json({ 
        error: `Could not retrieve media details using browser profile: ${err.message}.`,
        hint: `Make sure the selected browser is CLOSED so its cookie database is unlocked and readable.`
      });
    }
  }
  
  // Scenario B: Public link download (try SaveInsta first, fallback to yt-dlp)
  try {
    console.log('Trying SaveInsta scraper...');
    const saveInstaResult = await fetchFromSaveInsta(targetUrl);
    return res.json({ success: true, provider: 'SaveInsta Scraper', data: saveInstaResult });
  } catch (scraperErr) {
    console.warn(`SaveInsta Scraper failed: ${scraperErr.message}`);
    
    try {
      console.log('Falling back to yt-dlp (No Cookies)...');
      const ytdlResults = await runYtdlp(targetUrl, 'none');
      const formatted = formatYtdlpResults(ytdlResults);
      return res.json({ success: true, provider: 'yt-dlp (No Cookies)', data: formatted });
    } catch (ytdlErr) {
      console.error(`yt-dlp fallback failed: ${ytdlErr.message}`);
      
      let clientMsg = 'Could not fetch media. If this is a private account or restricted post, please select your logged-in browser session (Brave/Chrome/Firefox) from the settings below to download.';
      if (scraperErr.message && scraperErr.message.includes('private')) {
        clientMsg = 'This post is from a private account. Please select your logged-in browser session (Brave/Chrome/Firefox) from the dropdown to download it.';
      }
      
      return res.status(500).json({
        error: clientMsg,
        details: {
          scraper: scraperErr.message,
          ytdlp: ytdlErr.message
        }
      });
    }
  }
});

// Proxy route to bypass CORS and stream the content
app.get('/api/proxy-download', async (req, res) => {
  const mediaUrl = req.query.url;
  const filename = req.query.filename || 'instagram-download';
  
  if (!mediaUrl) {
    return res.status(400).json({ error: 'Missing media URL.' });
  }
  
  console.log(`Proxying file stream: ${mediaUrl.substring(0, 60)}...`);
  
  try {
    const response = await axios({
      method: 'get',
      url: mediaUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.instagram.com/'
      }
    });
    
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    
    // Guess file extension if missing
    let extension = '';
    if (contentType.includes('video/mp4')) extension = '.mp4';
    else if (contentType.includes('image/jpeg')) extension = '.jpg';
    else if (contentType.includes('image/png')) extension = '.png';
    else if (contentType.includes('image/webp')) extension = '.webp';
    
    const finalFilename = filename.endsWith(extension) ? filename : `${filename}${extension}`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFilename)}"`);
    
    response.data.pipe(res);
  } catch (error) {
    console.error('Download proxy failed:', error.message);
    res.status(500).json({ error: 'Failed to download the media file. The CDN download link may have expired.' });
  }
});

// Serve frontend files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Instagram Downloader is running functional!`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`💡 Access browser cookies to download private posts!`);
  console.log(`===============================================`);
});
