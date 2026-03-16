# Social Media Browsing Design

**Date:** 2026-03-13
**Status:** Approved

## Overview

Add social media browsing patterns to the pinchtab container skill so agents can read public content from X/Twitter (via Nitter), Xiaohongshu/RedNote, and Douban without accounts.

## Approach

Layer 1 (now): Enhance `container/skills/pinchtab/SKILL.md` with a "Social Media Browsing" section that teaches the agent:

- **X/Twitter**: Use Nitter frontends (xcancel.com) to bypass login walls
- **Xiaohongshu**: Browse xiaohongshu.com directly for public notes
- **Douban**: Browse douban.com directly for public movie/book/music content

Layer 2 (later, when user has accounts): Install dedicated MCP servers for structured data extraction.

## Changes

- Modify: `container/skills/pinchtab/SKILL.md` — add Social Media section with URL patterns, tips, fallback instances

## Research Summary

| Platform | No-account? | Via | Notes |
|---|---|---|---|
| X/Twitter | Yes (via Nitter) | xcancel.com, nitter.poach.me | Instances can be fragile |
| Xiaohongshu | Partial (public posts) | xiaohongshu.com | Full content viewable |
| Douban | Yes (public content) | douban.com | Movies, books, reviews open |
