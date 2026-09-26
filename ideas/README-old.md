# Ancient Rome

An interactive guide to Ancient Rome, built with plain HTML, CSS and JavaScript. No build step or dependencies.

## Features

- **Timeline** of 18 events from the founding of Rome (753 BC) to the fall of Constantinople (1453 AD), filterable by era
- **Key figures**: ten people from Scipio to Constantine
- **Roman numeral converter** for 1–3999, in both directions
- **Quiz** with 8 questions and explanations
- Light and dark themes, responsive layout

## Run it

Open `index.html` in a browser. Or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Edit the content

All timeline events, people and quiz questions live in [`data.js`](data.js). Add an entry to the relevant array and it appears on the page.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `style.css` | Styling and themes |
| `data.js` | Timeline, people and quiz content |
| `script.js` | Rendering, filters, converter and quiz logic |
