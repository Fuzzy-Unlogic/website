---
title: Hello, margins
date: 2026-10-28
summary: Why Fuzzy Unlogic keeps a blog, and how this one is built from plain markdown files.
---

This is the first scribble in the margins. The blog you're reading is built
from plain markdown files — drop a `.md` file in the `posts/` folder, and a
tiny build script turns it into a page, adds it to the index, and updates the
RSS feed. No CMS, no database, no client-side JavaScript.

## How it works

Each post is a markdown file with a little bit of frontmatter at the top:

```markdown
---
title: Hello, margins
date: 2026-10-28
summary: A first scribble.
---
```

The build step reads every file in `posts/`, sorts them newest-first, and
writes static HTML that reuses the same notepad theme as the rest of the site.

> The whole thing is deterministic and language-agnostic — the same spirit as
> the tools we ship.

That's it. More to come.
