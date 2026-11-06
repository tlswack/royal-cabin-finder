# Family Cabin Finder (Royal Caribbean)

A personal Chrome extension that searches Royal Caribbean sailings for:

- **Big rooms**: categories that sleep your whole party (for example 6), with rooms left and the online price.
- **Connecting rooms**: categories where connecting rooms are open when your party is split across 2 rooms, how many are open on each deck, and the exact room pairs Royal lists.

Search by destination, departure port, ship or ship class, month range and trip length. Results can be sorted, filtered by room type (interior, ocean view, balcony, suite) and exported to CSV.

## Saved scans

Every scan is saved automatically while it runs, one sailing at a time, so you can start a long scan, close the finder and come back later. A scan that's stopped, or that's cut off because Chrome or the Royal tab closed, keeps everything it found and shows as "Stopped early" or "Interrupted".

The **Saved scans** list on the finder page lets you open any past scan's full results, reuse its search settings, rename it, pin it, export it or delete it. The newest 30 unpinned scans are kept; pinned scans are never removed automatically.

Scans are stored in this Chrome profile on this computer. To see one on another computer, click **Export** (downloads a `.json` file), then use **Import a scan file** in the finder on the other computer. Imported scans are pinned.

## Install

1. Download or clone this repo to a folder on your computer.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the folder.
4. Pin the extension and click its icon to open the finder.

To update: pull the latest code, then click the reload arrow on the extension card in `chrome://extensions`.

## How it works

Royal's website blocks automated tools, so the extension runs its searches inside a pinned royalcaribbean.com tab in your own browser, using the same requests Royal's site makes. Scans are paced (about 8–10 seconds per sailing) to stay polite. Keep the pinned tab open while a scan runs.

- Sailing list: Royal's cruise-search GraphQL endpoint (`/cruises/graph`).
- Room data: the embedded data on Royal's room-selection pages (category, capacity, price, connecting flag, rooms left, and deck-level connecting pairs).

## Limits

- Royal won't book more than 4 guests in one room online. Big-room prices are for the first 4 guests; call Royal to add the rest.
- Ship class isn't published by Royal; it's a short list in `app.js` (`CLASSES`). New ships show as "Other" until added.
- If Royal changes its booking pages, scans will stop with a message saying the format changed, and the parser in `scanner.js` needs updating.
- For personal use. Automated access is against Royal's terms of use.
