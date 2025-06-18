# YouTube Video Tracker

<img src="icons/book.svg" width="24" height="24" style="vertical-align: middle;"> A Firefox extension that helps you track your progress through YouTube courses with chapter-based progress tracking.

## Features

- **Track YouTube courses** - Add any YouTube video with chapters to your course list
- **Real-time progress tracking** - Automatically tracks which chapters you've completed  
- **Advanced progress visualization** - Shows watched portions vs current position with gap indicators
- **Quick chapter navigation** - Click any chapter to jump directly to that timestamp
- **Chapter reset functionality** - Reset individual chapter progress with one click
- **Session tracking** - Counts how many times you've watched each course
- **Accurate watch time tracking** - Only counts time when video is actually playing
- **Clean sidebar UI** - Progress tracker appears in the right sidebar above video suggestions
- **Dark mode support** - Automatically adapts to your browser's theme
- **Responsive design** - Works on desktop, tablet, and mobile

## UI Features

### Progress Visualization
- **Green bars**: Completed watch time
- **Orange gaps**: Skipped portions (when you jump ahead)
- **Red indicator**: Current video position
- **Percentage display**: Shows completion percentage per chapter

### Interactive Elements
- **Floating button**: Always-visible Video Tracker access
- **Chapter navigation**: Click chapters to jump to timestamps
- **Reset buttons**: Individual chapter progress reset <img src="icons/reset.svg" width="16" height="16" style="vertical-align: middle;">
- **Collapsible UI**: Minimize/maximize the progress tracker

## Supported Timestamp Formats

The extension automatically parses various timestamp formats from video descriptions:

- `0:00`, `1:23`, `12:34` (minutes:seconds)
- `1:23:45` (hours:minutes:seconds)
- `(0:00)`, `[1:23]`, `{12:34}` (with brackets/parentheses)
- Removes common prefixes like "Chapter 1:", "Part 2:", bullet points, etc.

## Installation

### Firefox
1. Open Firefox and go to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from this extension folder
5. The extension will be loaded and ready to use

## How to Use

1. **Visit a YouTube video** that has chapters/timestamps in the description
2. **Look for the floating button** <img src="icons/book.svg" width="16" height="16" style="vertical-align: middle;"> on the right side of the page
3. **Click the extension icon** in your browser toolbar
4. **Click "Track Course"** <img src="icons/add.svg" width="16" height="16" style="vertical-align: middle;"> to add the video to your course list
5. **Return to the video** - the progress tracker will now appear in the right sidebar
6. **Watch the video** - progress updates automatically as you watch
7. **Use the progress tracker** to:
   - See your overall progress and watch time
   - Jump to specific chapters by clicking them
   - Reset individual chapter progress with the <img src="icons/reset.svg" width="16" height="16" style="vertical-align: middle;"> button
   - View completion status for each chapter <img src="icons/check.svg" width="16" height="16" style="vertical-align: middle;">
8. **View all courses** by clicking the extension icon from any page

## Controls

- **Click chapters**: Jump to timestamp
- **Reset button** <img src="icons/reset.svg" width="16" height="16" style="vertical-align: middle;">: Reset individual chapter progress
- **Expand/Collapse** <img src="icons/plus.svg" width="16" height="16" style="vertical-align: middle;"><img src="icons/minus.svg" width="16" height="16" style="vertical-align: middle;">: Minimize/maximize progress tracker
- **Floating button** <img src="icons/book.svg" width="16" height="16" style="vertical-align: middle;">: Toggle progress tracker visibility

## Progress Tracking

- **Chapter completion**: Automatically marked as complete when you watch 90% of a chapter
- **Real-time updates**: Progress updates every second while the video is playing
- **Gap visualization**: Shows skipped portions when you jump ahead in videos
- **Session counting**: Tracks how many times you've visited each course
- **Watch time**: Only counts time when the video is actually playing (not paused)

## Data Storage

- All data is stored locally in your browser using the WebExtensions storage API
- No data is sent to external servers
- Automatic cleanup removes courses not watched in over a month

## Troubleshooting

### Extension not working on YouTube
- Make sure you've granted the extension permission to access YouTube
- Try refreshing the YouTube page after installing the extension
- Check browser console (F12) for error messages

### Chapters not detected
- The extension looks for timestamps in the video description
- Make sure the video has timestamps in formats like "0:00 Introduction"
- Some videos may not have properly formatted chapters
- Use the debug mode to see what's being parsed

### Progress not saving
- Check that the extension has storage permissions
- Try disabling and re-enabling the extension
- Clear browser cache and reload

### UI not appearing
- Look for the floating <img src="icons/book.svg" width="16" height="16" style="vertical-align: middle;"> button on the right side
- Try clicking the extension icon and tracking the course first
- Check if the video has a description with timestamps

## Development

### File Structure
```
├── manifest.json              # Extension configuration
├── popup.html                 # Extension popup interface
├── popup.js                   # Popup logic and chapter parsing
├── content.js                 # YouTube page integration
├── content.css                # Progress tracker styling
├── background.js              # Background script for data management
├── icons/                     # Extension icons and UI elements
│   ├── add.svg               # Add/track course button
│   ├── book.svg              # Main extension icon
│   ├── check.svg             # Completion indicator
│   ├── circle.svg            # UI element
│   ├── edit.svg              # Edit functionality
│   ├── minus.svg             # Collapse control
│   ├── plus.svg              # Expand control
│   ├── remove.svg            # Remove/delete action
│   └── reset.svg             # Reset progress button
└── README.md                  # This file
```

### Key Components
- **Chapter Parser**: Robust timestamp detection from video descriptions
- **Progress Tracker**: Real-time progress monitoring with gap detection
- **UI Manager**: Sidebar integration and responsive design
- **Data Manager**: Local storage and session tracking

## Icons

The extension includes a comprehensive set of SVG icons for all UI interactions. All icons use `currentColor` fill to automatically adapt to light and dark themes.

### Icon Attribution

This extension uses icons from the CSS.GG icon library (stylized as CSS＊GG) and GLYF＊APP:
- **Source**: https://css.gg | https://glyf.app
- **Repository**: https://github.com/astrit/css.gg
- **Author**: Astrit
- **Icons used**: Various UI icons for buttons and interface elements

The CSS.GG and GLYF＊APP icons are used under their license terms. All brand names and stylizations remain intact and unaltered as required.

## License

This project is open source and available under the MIT License.

### Third-Party Licenses

#### CSS.GG & GLYF＊APP Icons

The icons used in this extension are from the CSS.GG icon library (stylized as CSS＊GG) and GLYF＊APP, which are subject to their own license terms:

**Copyright © 2024 CSS＊GG & GLYF＊APP**
- **Websites**: https://css.gg | https://glyf.app
- **Repository**: https://github.com/astrit/css.gg
- **Author**: Astrit

**License Summary**:
- Attribution required to CSS＊GG, GLYF＊APP, and author Astrit
- Brand names and stylizations must remain intact and unaltered
- Used for personal, non-commercial purposes in this extension
- Full license terms available at: https://css.gg

**Attribution**: This extension uses icons from CSS.GG (CSS＊GG) and GLYF＊APP by Astrit. The brand names and their stylizations remain intact and unaltered as required by their license terms.

## Contributing

Feel free to submit issues and enhancement requests! The extension is designed to be easily extensible for additional features.

---

**Happy Learning!** <img src="icons/book.svg" width="20" height="20" style="vertical-align: middle;">