// Static blog generator for the Fuzzy Unlogic site.
//
// Scans posts/*.md (YAML frontmatter + markdown body) and writes:
//   blog/<slug>.html   one page per post
//   blog/index.html    dated listing, newest first
//   feed.xml           RSS 2.0 feed
//
// No framework, no client-side JS — just plain static HTML that reuses the
// existing notepad theme in style.css. Run with `npm run build`.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = join(ROOT, "posts");
const OUT_DIR = join(ROOT, "dist"); // Netlify publish dir — keeps node_modules/posts/build.js off the CDN.
const BLOG_DIR = join(OUT_DIR, "blog");

// Root static files copied verbatim into the publish dir.
const STATIC_FILES = ["index.html", "style.css"];

// Netlify exposes the primary site URL as `URL` at build time.
const SITE_URL = (process.env.URL || "https://fuzzy-unlogic.netlify.app").replace(/\/$/, "");
const SITE_TITLE = "Fuzzy Unlogic";
const SITE_DESC = "Open source tools, scribbled in the margins & shipped to the world.";

const FAVICON =
  'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📝</text></svg>';

const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Strip an optional leading YYYY-MM-DD- and the .md extension for the slug.
const slugify = (filename) => filename.replace(/\.md$/i, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");

const formatDate = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

// Shared page shell — mirrors index.html so generated pages match the theme.
function renderPage({ title, description, cssHref, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="icon" href="${FAVICON}" />
  <link rel="alternate" type="application/rss+xml" title="${esc(SITE_TITLE)}" href="${SITE_URL}/feed.xml" />
  <link rel="stylesheet" href="${cssHref}" />
</head>
<body>
  <main class="notepad" role="main">
    <div class="tape" aria-hidden="true"></div>
${bodyHtml}
    <footer class="colophon">
      <p><a href="/">&larr; fuzzy-unlogic</a> &middot; <a href="${SITE_URL}/feed.xml">rss</a></p>
    </footer>
  </main>
</body>
</html>
`;
}

function loadPosts() {
  let files;
  try {
    files = readdirSync(POSTS_DIR).filter((f) => f.toLowerCase().endsWith(".md"));
  } catch {
    return [];
  }

  const posts = files.map((file) => {
    const raw = readFileSync(join(POSTS_DIR, file), "utf8");
    const { data, content } = matter(raw);
    if (!data.title || !data.date) {
      throw new Error(`posts/${file}: frontmatter must include "title" and "date".`);
    }
    // YAML parses a bare YYYY-MM-DD to a UTC Date; any other string is
    // normalised to UTC midnight so the displayed day never shifts by timezone.
    const parsed =
      data.date instanceof Date ? data.date : new Date(`${String(data.date).trim()}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`posts/${file}: invalid date ${JSON.stringify(data.date)} — use YYYY-MM-DD.`);
    }
    return {
      file,
      slug: slugify(file),
      title: String(data.title),
      date: parsed.toISOString().slice(0, 10),
      summary: data.summary ? String(data.summary) : "",
      html: marked.parse(content),
    };
  });

  // Fail loudly if two files collapse to the same slug — otherwise one would
  // silently overwrite the other on disk while both appear in the index.
  const seen = new Map();
  for (const p of posts) {
    if (seen.has(p.slug)) {
      throw new Error(
        `Duplicate slug "${p.slug}" from ${seen.get(p.slug)} and ${p.file}. Rename one file.`
      );
    }
    seen.set(p.slug, p.file);
  }

  // Newest first.
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return posts;
}

function renderPost(post) {
  const body = `    <header class="masthead">
      <h1>${esc(post.title)}</h1>
      <p class="post-meta"><time datetime="${post.date}">${formatDate(post.date)}</time></p>
    </header>
    <article class="block post">
${post.html}
    </article>
`;
  return renderPage({
    title: `${post.title} — ${SITE_TITLE}`,
    description: post.summary || SITE_DESC,
    cssHref: "../style.css",
    bodyHtml: body,
  });
}

function renderIndex(posts) {
  const items = posts
    .map(
      (p) => `        <li class="tool">
          <a class="tool-link" href="/blog/${p.slug}.html">
            <span class="tool-name">${esc(p.title)}</span>
            <span class="tool-arrow" aria-hidden="true">&rarr;</span>
          </a>
          <p class="post-meta"><time datetime="${p.date}">${formatDate(p.date)}</time></p>
          ${p.summary ? `<p class="tool-desc">${esc(p.summary)}</p>` : ""}
        </li>`
    )
    .join("\n");

  const body = `    <header class="masthead">
      <h1>blog</h1>
      <p class="tagline">Notes from the margins.</p>
    </header>
    <section class="block" aria-labelledby="posts-heading">
      <h2 id="posts-heading"># posts</h2>
      <ul class="tool-list post-list">
${items || '        <li class="tool"><p class="tool-desc">Nothing written yet.</p></li>'}
      </ul>
    </section>
`;
  return renderPage({
    title: `blog — ${SITE_TITLE}`,
    description: `Writing from ${SITE_TITLE}.`,
    cssHref: "../style.css",
    bodyHtml: body,
  });
}

function renderFeed(posts) {
  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}.html</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}.html</guid>
      <pubDate>${new Date(p.date + "T00:00:00Z").toUTCString()}</pubDate>
      ${p.summary ? `<description>${esc(p.summary)}</description>` : ""}
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(SITE_TITLE)}</title>
    <link>${SITE_URL}/blog/</link>
    <description>${esc(SITE_DESC)}</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
}

function build() {
  const posts = loadPosts();

  // Fresh output each run.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(BLOG_DIR, { recursive: true });

  // Copy the hand-written static site into the publish dir.
  for (const name of STATIC_FILES) {
    copyFileSync(join(ROOT, name), join(OUT_DIR, name));
  }

  for (const post of posts) {
    writeFileSync(join(BLOG_DIR, `${post.slug}.html`), renderPost(post));
  }
  writeFileSync(join(BLOG_DIR, "index.html"), renderIndex(posts));
  writeFileSync(join(OUT_DIR, "feed.xml"), renderFeed(posts));

  console.log(`Built ${posts.length} post(s) → dist/`);
}

build();
