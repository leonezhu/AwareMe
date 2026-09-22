# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AwareMe is a Chrome/Edge browser extension (Manifest V3) that helps users improve self-awareness and control attention while browsing. It provides two types of monitoring rules:
- **Visit Reminders**: Show a reminder modal immediately when visiting specified websites
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
| `background.js` | Service worker - handles access checks and rule enforcement |
| `content.js` | Content script - manages loading overlay and reminder modals on monitored pages |
| `utils.js` | Shared utilities - `AwareMeUtils` (domain extraction, config loading) and `AwareMeStats` (statistics, data cleanup) |
| `options.js` | Settings page - rule configuration and statistics display |
| `popup.js` | Popup window - quick status view and extension toggle |

### Data Flow

1. **Page Load**: `content.js` checks if domain is configured → shows loading overlay → sends `checkCurrentPage` to background
2. **Background Processing**: `background.js` checks all rules → records visit → sends `showReminder` or `pageAllowed`

### Storage Keys

- `userConfig`: User configuration object
- `isEnabled`: Extension enabled/disabled state
- `visits_${date}`: Daily visit counts per domain (e.g., `visits_Mon Mar 14 2026`)
- `weekly_${domain}_${weekStart}`: Weekly visit tracking per domain

### Configuration Structure

```javascript
{
  visitReminders: [{ domains: [], confirmTimes: 1, message: "", status: true, strict: false }],
  weeklyLimits: [{ domains: [], confirmTimes: 1, maxVisits: 0, message: "", status: true, strict: false }]
}
```

### Strict Mode Rules

Rules with `strict: true` are protected against self-bypass. Enabling strict mode is a deliberate flow: checking the checkbox only marks the rule as pending; clicking the table's save button validates the row data (`validateRuleData`), verifies the rule is not being weakened relative to its last saved state (`applyPendingStrict`), and asks for a `confirm()` before `strict` takes effect.

`options.js` `saveConfig()` is the single write path for `userConfig` and validates against the last saved config before persisting (`findStrictViolations`). For strict rules, saves are rejected (and rolled back) when:
- An existing domain is removed from the rule (adding domains is allowed)
- `maxVisits` (max weekly visit days) is increased
- `confirmTimes` is decreased

This also blocks weakening via "恢复默认" (reset to defaults) and rule deletion. Note the UI lock is only cosmetic — the save-time validation is the real enforcement.

### Rule Matching

- Domain matching uses `includes()` - a configured domain "weibo.com" matches "www.weibo.com" and "m.weibo.com"
- Rules can group multiple domains together (e.g., group GitHub and GitLab for combined weekly visit tracking)
- `confirmTimes` controls how many times user must click "坚持访问" to dismiss the modal

### Message Types

Background ← → Content Script communication:
- `checkCurrentPage`: Content → Background (request access check)
- `pageAllowed`: Background → Content (allow access, remove overlay)
- `showReminder`: Background → Content (show reminder modal)
- `openOptions`: Content → Background (open settings page)
- `closeCurrentTab`: Content → Background (close current tab)
- `toggleExtension` / `getExtensionStatus`: Popup ↔ Background

### Debug Functions

Available in background page console:
- `debugAwareMe()`: Log current extension state
