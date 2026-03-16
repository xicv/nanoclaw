---
name: douban
description: >
  Browse Douban (豆瓣) for movies, music, books, artist/celebrity info, and reviews.
  Uses Pinchtab for browser automation with anti-scraping best practices.
---

# Douban Browsing Skill

Browse douban.com for movies, music, books, artists, and reviews — all public, no account needed.

**Prerequisite:** Pinchtab must be running (use the `pinchtab` skill for API reference).

## Quick Start

```bash
# 1. Navigate to a movie page
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://movie.douban.com/subject/1292052/", "waitFor": "h1"}'

# 2. Extract text content
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

## Content Domains

| Domain          | URL Pattern                        | Content                             |
| --------------- | ---------------------------------- | ----------------------------------- |
| Movies/TV       | `movie.douban.com/subject/{id}/`   | Ratings, cast, synopsis, reviews    |
| Movie Celebrity | `movie.douban.com/celebrity/{id}/` | Filmography, bio, photos            |
| Music Album     | `music.douban.com/subject/{id}/`   | Tracklist, rating, artist info      |
| Musician        | `music.douban.com/musician/{id}/`  | Discography, bio, photos            |
| Book            | `book.douban.com/subject/{id}/`    | Rating, synopsis, publisher         |
| Author          | `book.douban.com/author/{id}/`     | Bibliography, bio                   |
| Personage       | `www.douban.com/personage/{id}/`   | Unified cross-domain artist profile |
| Groups          | `www.douban.com/group/topic/{id}/` | Public group discussions            |

## Artist & Celebrity Info

### Movie Celebrities (Actors, Directors)

```bash
# Celebrity profile — bio, filmography
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://movie.douban.com/celebrity/1054521/", "waitFor": "h1"}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Celebrity filmography (sortable)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://movie.douban.com/celebrity/1054521/movies?sortby=time", "waitFor": ".article"}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Celebrity photos
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://movie.douban.com/celebrity/1054521/photos/"}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Co-star relationships
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://movie.douban.com/celebrity/1054521/partners"}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

**Celebrity sub-pages:**

| Path                       | Content                                                 |
| -------------------------- | ------------------------------------------------------- |
| `/celebrity/{id}/`         | Bio, basic filmography                                  |
| `/celebrity/{id}/movies`   | Full filmography (add `?sortby=time` or `?sortby=vote`) |
| `/celebrity/{id}/photos/`  | Photo gallery                                           |
| `/celebrity/{id}/partners` | Frequent co-star list                                   |

### Musicians

```bash
# Musician profile — bio, discography
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://music.douban.com/musician/104904/", "waitFor": "h1"}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

**Musician page includes:** bio, genre tags, discography (linked album pages), photos.

### Book Authors

```bash
# Author profile — bio, bibliography
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://book.douban.com/author/4561353/", "waitFor": "h1"}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

### Unified Personage (Cross-Domain Artist Profile)

Aggregates movie/music/book appearances into one page.

```bash
# Cross-domain artist page
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.douban.com/personage/27484095/", "waitFor": ".basic-info"}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

**Find personage ID via search:**

```bash
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.douban.com/search?cat=1065&q=周杰伦"}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

## Search

### Cross-Domain Search

```bash
# Search movies (cat=1002)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.douban.com/search?cat=1002&q=inception", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Search music (cat=1003)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.douban.com/search?cat=1003&q=周杰伦", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Search books (cat=1001)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.douban.com/search?cat=1001&q=三体", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Search personage/artists (cat=1065)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.douban.com/search?cat=1065&q=刘德华", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

**Search category codes:** `1001` = books, `1002` = movies/TV, `1003` = music, `1065` = personage

### Movie-Specific Search (Domain Search)

```bash
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://search.douban.com/movie/subject_search?search_text=inception", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

### AJAX Endpoints (Structured JSON)

These return JSON directly — use `curl` from the container instead of Pinchtab for efficiency:

```bash
# Movie autocomplete/suggest (returns JSON array)
curl -s 'https://movie.douban.com/j/subject_suggest?q=inception' \
  -H 'Referer: https://movie.douban.com/' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

# Browse movies by tag (returns JSON with subjects array)
curl -s 'https://movie.douban.com/j/search_subjects?type=movie&tag=热门&sort=recommend&page_limit=20&page_start=0' \
  -H 'Referer: https://movie.douban.com/' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
```

**Tags for `/j/search_subjects`:**

| type=movie                               | type=tv                                        |
| ---------------------------------------- | ---------------------------------------------- |
| 热门, 最新, 经典, 华语, 欧美, 韩国, 日本 | 热门, 美剧, 英剧, 韩剧, 日剧, 国产剧, 日本动画 |

## Charts & Rankings

```bash
# Top 250 movies
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://movie.douban.com/top250", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Top 250 books
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://book.douban.com/top250", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Movie charts by genre
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://movie.douban.com/chart", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

## Downloading Images

Douban images on `img*.doubanio.com` require a Douban Referer header. When browsing via Pinchtab the browser sets this automatically. For direct downloads:

```bash
# Get image URLs from a celebrity photo page
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://movie.douban.com/celebrity/1054521/photos/"}'

# Use /evaluate to extract image URLs
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/evaluate" \
  -H 'Content-Type: application/json' \
  -d '{"expression": "JSON.stringify([...document.querySelectorAll(\".poster-col3 img\")].map(i => i.src))"}'

# Download image with correct Referer
curl -s -o /workspace/group/photo.jpg \
  -H 'Referer: https://movie.douban.com/' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' \
  'https://img9.doubanio.com/view/photo/l/public/p2641806535.jpg'
```

**Image URL size variants** — swap the size segment to get different resolutions:

| Segment | Size                      | Use case                 |
| ------- | ------------------------- | ------------------------ |
| `/s/`   | Small thumbnail           | Listings, previews       |
| `/m/`   | Medium                    | Default display          |
| `/l/`   | Large (highest available) | Full resolution download |

**CDN domains:** `img1.doubanio.com` through `img9.doubanio.com` (load-balanced, same content).

To upgrade any image URL to max resolution: replace `/s/` or `/m/` with `/l/` in the URL path.

## Anti-Scraping Best Practices

Douban blocks aggressive automated access. Follow these rules:

### Rate Limiting

- **Minimum 2 seconds between page navigations** (1 second absolute minimum)
- Add random jitter: `sleep $((2 + RANDOM % 2))` between requests
- ~40 requests/minute is the safe ceiling
- If you get HTTP 403: stop for 60 seconds, then resume slower

### Session Setup

Always start a Douban session by visiting the homepage first — this sets the required `bid` cookie:

```bash
# Initialize session (sets cookies automatically)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.douban.com", "waitFor": "body"}'

# Wait before navigating to target
sleep 2

# Now browse target content
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://movie.douban.com/celebrity/1054521/"}'
```

### Stealth Mode

If you hit blocks, enable Pinchtab stealth mode to mask headless Chrome detection:

```bash
# Rotate browser fingerprint
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/stealth/fingerprint/rotate"
```

### Recovery from Blocks

1. If 403 response: wait 60 seconds
2. Clear cookies: navigate to `about:blank`, then restart from `www.douban.com`
3. Rotate fingerprint via `/stealth/fingerprint/rotate`
4. Resume with slower pace (3-5 second intervals)

### Headers for Direct curl Requests

When calling Douban AJAX endpoints directly (not via Pinchtab), set these headers:

```bash
curl -s 'https://movie.douban.com/j/subject_suggest?q=test' \
  -H 'Referer: https://movie.douban.com/' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' \
  -H 'Accept: application/json, text/javascript, */*; q=0.01' \
  -H 'Accept-Language: zh-CN,zh;q=0.9'
```

## Content Requiring Login

| Content                              | Login? | Notes                   |
| ------------------------------------ | ------ | ----------------------- |
| Movie/book/music detail pages        | No     | Fully public            |
| Celebrity/musician/author profiles   | No     | Fully public            |
| Personage pages                      | No     | Fully public            |
| Short reviews (first ~200)           | No     | ~10 pages visible       |
| Short reviews (beyond 200)           | Yes    | Login wall at page 11+  |
| Long reviews (full text)             | No     | Publicly readable       |
| Top 250 lists                        | No     | Fully public            |
| Charts and rankings                  | No     | Fully public            |
| Public group posts                   | No     | Read-only without login |
| Creating content (ratings, comments) | Yes    | Requires account        |
| User profiles/collections            | Varies | Some data public        |

## Tips

- Content is in **Chinese** — use translation when needed
- Use `/text` endpoint for content extraction (cheapest token cost)
- Use `blockImages: true` on navigate for text-heavy browsing
- Douban subdomains are separate sites: always use the full URL (movie.douban.com, not douban.com/movie)
- For bulk research, prefer AJAX endpoints (`/j/subject_suggest`) over page navigation — faster and lighter
- Celebrity IDs are different from personage IDs — use search to find the right one
- Image downloads need `Referer: https://movie.douban.com/` (or matching subdomain)
