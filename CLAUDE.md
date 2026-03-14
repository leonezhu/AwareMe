# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AwareMe is a Chrome/Edge browser extension (Manifest V3) that helps users improve self-awareness and control attention while browsing. It provides three types of monitoring rules:
- **Visit Reminders**: Show a reminder modal immediately when visiting specified websites
- **Duration Limits**: Track browsing time and show reminders when exceeding limits
- **Weekly Limits**: Track weekly visit frequency and block access when exceeding limits

## Development Commands

```bash
# Validate manifest
npm run validate

# Build/package extension
npm run package

# Development: Load extension in Chrome developer mode
# 1. Go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select the project root directory
```

## Architecture

### Core Files

| File | Purpose |
|------|---------|
| `background.js` | Service worker - handles tab tracking, duration monitoring, access checks, and rule enforcement |
| `content.js` | Content script - manages loading overlay, reminder modals, and video pausing on monitored pages |
| `utils.js` | Shared utilities - `AwareMeUtils` (domain extraction, config loading) and `AwareMeStats` (statistics, data cleanup) |
| `options.js` | Settings page - rule configuration and statistics display |
| `popup.js` | Popup window - quick status view and extension toggle |

### Data Flow

1. **Page Load**: `content.js` checks if domain is configured → shows loading overlay → sends `checkCurrentPage` to background
2. **Background Processing**: `background.js` checks all rules → records visit → sends `showReminder` or `pageAllowed`
3. **Duration Tracking**: Background tracks active tab time via `tabs.onActivated`, `tabs.onUpdated`, `windows.onFocusChanged`
4. **Periodic Checks**: 40-second interval checks duration limits on active tab

### Storage Keys

- `userConfig`: User configuration object
- `isEnabled`: Extension enabled/disabled state
- `visits_${date}`: Daily visit counts per domain (e.g., `visits_Mon Mar 14 2026`)
- `duration_${date}`: Daily duration per domain in milliseconds
- `weekly_${domain}_${weekStart}`: Weekly visit tracking per domain

### Configuration Structure

```javascript
{
  visitReminders: [{ domains: [], confirmTimes: 1, message: "", status: true }],
  durationLimits: [{ domains: [], confirmTimes: 1, minutes: 30, message: "", status: true }],
  weeklyLimits: [{ domains: [], confirmTimes: 1, maxVisits: 0, message: "", status: true }]
}
```

### Rule Matching

- Domain matching uses `includes()` - a configured domain "weibo.com" matches "www.weibo.com" and "m.weibo.com"
- Rules can group multiple domains together (e.g., group YouTube and Bilibili for combined duration tracking)
- `confirmTimes` controls how many times user must click "坚持访问" to dismiss the modal

### Message Types

Background ← → Content Script communication:
- `checkCurrentPage`: Content → Background (request access check)
- `pageAllowed`: Background → Content (allow access, remove overlay)
- `showReminder`: Background → Content (show reminder modal)
- `openOptions`: Content → Background (open settings page)
- `closeCurrentTab`: Content → Background (close current tab)
- `toggleExtension` / `getExtensionStatus`: Popup ↔ Background

### Video Pausing

For duration reminders, `content.js` pauses all videos including:
- Native `<video>` elements
- YouTube, Bilibili, Tencent Video, iQiyi, Youku, Douyin
- Uses platform-specific play buttons and APIs
- Monitors and re-pauses if video resumes during reminder

### Debug Functions

Available in background page console:
- `debugAwareMe()`: Log current extension state
- `checkDurationLimitsNow()`: Manually trigger duration check
