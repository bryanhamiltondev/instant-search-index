# instant-search-index

![License](https://img.shields.io/badge/license-MIT-e3b341?style=flat)
![Dependencies](https://img.shields.io/badge/dependencies-0-e3b341?style=flat)
![Server round-trips](https://img.shields.io/badge/round--trips-0-e3b341?style=flat)
![Size](https://img.shields.io/badge/search.js-one%20file-777BB4?style=flat)

**[Try it live](https://bryanhamiltondev.github.io/instant-search-index/demo/)** - type, then put the mouse away and use the arrow keys.

Instant client-side search from a prebuilt JSON index, extracted from
[The DJ Calendar](https://thedjcalendar.com), where it powers search across a
site of ~1,000 pages with no search server, no framework, and no library.

## The opinion underneath it

Most search boxes are infrastructure cosplay: a request to a search endpoint,
a spinner, a payload, for what is usually a list of a few hundred names that
the page could have shipped with in the first place.

This repo's stance: **if the catalog fits in the page, the search belongs in
the page.** Ship the index as JSON, score it in the browser on every
keystroke, and the search feels instant because it *is* - there is no network
left to wait on. No server round-trips. No framework. No library. One file.

## Quick start

Declarative - the index travels in the attribute, the widget builds itself:

```html
<link rel="stylesheet" href="src/search.css">
<script src="src/search.js" defer></script>

<input type="text" data-instant-search='[
  {"title": "Carl Cox", "subtitle": "Techno", "keywords": "techno house icon", "badge": "Artist", "url": "/artists/carl-cox"},
  {"title": "Amelie Lens", "subtitle": "Techno", "keywords": "techno belgium", "badge": "Artist", "url": "/artists/amelie-lens"}
]'>
```

Programmatic - for records that live in JS or arrive at runtime:

```js
InstantSearch.attach(inputEl, records, { maxResults: 6, placeholder: "Find an artist..." });
```

## The index contract

One JSON array. Three searchable fields and two display-only ones:

```json
{
  "title": "Carl Cox",
  "subtitle": "Techno / House",
  "keywords": "techno house icon ibiza space",
  "badge": "Artist",
  "url": "/artists/carl-cox"
}
```

- `title` - required. The primary match surface, weighted heaviest.
- `subtitle` - optional. Displayed right-aligned; lightly searchable.
- `keywords` - optional. The synonym field: genre names, city names, whatever
  your users type that isn't in the title.
- `badge` - optional. Display-only tag ("Artist", "Venue", "City").
- `url` - where Enter navigates.

The production trick behind this contract: the server renders the index once
at page build time, so the client never fetches anything at search time.
Search-time work is zero; the only payload is data the page wanted anyway.

## How records are scored

Every keystroke scores all records; a record must match **every** query token
somewhere (AND semantics) or it drops out. Where a match lands decides rank:

| Signal | Weight | Meaning |
|---|---|---|
| Title token exact | 60 | "cox" hits "Cox" |
| Title token prefix | 40 | "ame" hits "Amelie" |
| Keyword exact | 30 | "techno" hits the genre field |
| Keyword prefix | 18 | "tech" hits "techno" |
| Subtitle exact / prefix | 12 / 8 | useful, but not the point |
| Loose substring | 4 | the safety net |
| Full-phrase hit | +25 | "black coffee" beats token soup |

Ties break toward shorter titles - "Carl Cox" outranks "The Carl Cox
Experience" - then toward index order, which keeps results stable.

Precomputed token lists are built once at load, so a keystroke scores arrays,
never re-splits strings. On a few hundred records, this is microseconds.

## Keyboard & ARIA (first-class, not an afterthought)

The input is a real ARIA combobox: `role="combobox"`, `aria-expanded`,
`aria-controls`, `aria-activedescendant` pointing into a `role="listbox"` of
options. The keys:

| Key | Does |
|---|---|
| `ArrowDown` / `ArrowUp` | move the active option |
| `Enter` | go to the active option; if exactly one result, go straight there |
| `Escape` | close the list |

Matched text is highlighted with `<mark>` in the results. Everything is
escaped before it is rendered; index entries are data, not markup.

## Knobs

| Option | Default | Meaning |
|---|---|---|
| `minLength` | `2` | queries shorter than this open nothing |
| `maxResults` | `8` | cap the list - the top of the list is the product |
| `debounce` | `80` | ms of typing silence before re-scoring |
| `emptyMessage` | `"No matches."` | shown when nothing matches |
| `placeholder` | `"Search..."` | input placeholder |

## Requirements

- Any browser from the last decade. No build step, no framework, no bundler.
- The page, not the network, carries the index - so keep catalogs to the size
  that makes sense in a payload (hundreds of records: trivially fine).

## Origin

Extracted from The DJ Calendar (https://thedjcalendar.com), where this pattern
has run site search across ~1,000 pages since 2015 without a search server.
Like everything published under this account, it is a production-derived
pattern: what ships here is the idea, not the infrastructure.

## License

MIT
